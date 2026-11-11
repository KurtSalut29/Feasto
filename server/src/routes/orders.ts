import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { invalidateStore } from "../lib/redisCache.js";
import { readCartQuantities, setCartQuantity } from "../lib/cart.js";
import { autoCancelAt } from "../lib/autoCancel.js";
import { prisma } from "../lib/db.js";
import { getSettings } from "../lib/settings.js";
import { HttpError, parseBody } from "../lib/http.js";
import { broadcastOrder, orderCode, refreshStoreCache, restoreStock, settlePayment, transition } from "../lib/orders.js";
import { notify } from "../lib/liveUpdates.js";
import { unmarshal } from "../lib/marshalling.js";
import { redis } from "../lib/redis.js";
import { RATE_RIDER_DAYS, riderRatingSchema, shortName } from "../lib/riderRatings.js";
import { ONLINE_LABEL } from "../lib/payments.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** A resident's own orders. */
export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRole("RESIDENT"));

const orderInclude = {
  vendor: { select: { id: true, name: true, address: true, latitude: true, longitude: true, imageUrl: true, owner: { select: { phone: true } } } },
  items: { select: { id: true, name: true, unitPrice: true, quantity: true } },
  rider: { select: { name: true, phone: true, riderProfile: { select: { vehicleModel: true, plateNumber: true, ratingSum: true, ratingCount: true } } } },
  checkout: {
    select: { id: true, paymentMethod: true, onlineMethod: true, paymentStatus: true, deliveryAddress: true, deliveryLat: true, deliveryLng: true, notes: true, total: true, createdAt: true },
  },
  review: { select: { rating: true, comment: true, createdAt: true } },
  riderRating: { select: { rating: true, tags: true, comment: true, createdAt: true } },
} as const;

ordersRouter.get("/", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { checkout: { residentId: req.session!.userId } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: orderInclude,
  });
  res.json({ orders });
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: String(req.params.id), checkout: { residentId: req.session!.userId } },
    include: orderInclude,
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  // The rider's last known position, kept in Redis from accepting the job until it's delivered
  const location = order.riderId && ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"].includes(order.status) ? await redis.get(`rider-location:${order.id}`) : null;
  // When it will be cancelled by itself if nobody takes it, so the resident knows what to expect
  const autoCancel = autoCancelAt(order, (await getSettings()).autoCancelMinutes);
  res.json({ order, autoCancel, riderLocation: location ? unmarshal(location, { transport: "redis", channel: `rider-location:${order.id}`, kind: "rider location" }) : null });
});

/** Residents can cancel until the store accepts. If both happen at once, only one wins. */
ordersRouter.post("/:id/cancel", async (req, res) => {
  const id = String(req.params.id);
  const order = await prisma.order.findFirst({
    where: { id, checkout: { residentId: req.session!.userId } },
    select: { checkoutId: true, vendor: { select: { ownerId: true, name: true } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");

  const vendorId = await prisma.$transaction(async (tx) => {
    await transition(tx, id, ["PLACED", "AWAITING_PAYMENT"], "CANCELLED", { finishedAt: new Date(), rejectReason: "Cancelled by the resident" });
    const restored = await restoreStock(tx, id);
    await settlePayment(tx, order.checkoutId);
    return restored;
  }).catch((error) => {
    if (error instanceof HttpError && error.status === 409) {
      throw new HttpError(409, "The store already accepted this order, so it can't be cancelled.");
    }
    throw error;
  });

  await refreshStoreCache(vendorId);
  await notify(order.vendor.ownerId, { title: "An order was cancelled", body: "The resident cancelled before you accepted it.", link: "/vendor/orders" });
  await broadcastOrder(id);
  res.json({ ok: true });
});

// ---------- Ratings ----------

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
  comment: z.string().trim().max(500, "Keep it under 500 characters.").optional(),
});

/** Rate a delivered or collected order, once. The store's running totals change in the same transaction. */
ordersRouter.post("/:id/review", async (req, res) => {
  const id = String(req.params.id);
  const { rating, comment } = parseBody(reviewSchema, req.body);
  const residentId = req.session!.userId;
  const order = await prisma.order.findFirst({
    where: { id, checkout: { residentId } },
    select: { status: true, vendorId: true, vendor: { select: { ownerId: true } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
    throw new HttpError(400, "You can rate an order once you've received it.");
  }

  try {
    await prisma.$transaction([
      prisma.review.create({ data: { orderId: id, vendorId: order.vendorId, residentId, rating, comment: comment || null } }),
      prisma.vendor.update({
        where: { id: order.vendorId },
        data: { ratingSum: { increment: rating }, ratingCount: { increment: 1 } },
      }),
    ]);
  } catch (error) {
    // The unique index on orderId stops a second rating, even from two tabs at once
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "You already rated this order.");
    }
    throw error;
  }

  await invalidateStore(order.vendorId);
  await notify(order.vendor.ownerId, {
    title: `New ${rating}-star rating`,
    body: comment ? `"${comment.slice(0, 80)}" on ${orderCode(id)}` : `For order ${orderCode(id)}.`,
    link: "/vendor",
  });
  res.status(201).json({ ok: true });
});

/**
 * Rate the rider who delivered it, once, and maybe tip them. The tip is paid online (simulated,
 * like the checkout): with the order's own e-wallet or card, or one the resident picks for a cash
 * order. The rating, the rider's running totals and the tip are saved together or not at all.
 */
ordersRouter.post("/:id/rider-rating", async (req, res) => {
  const id = String(req.params.id);
  const input = parseBody(riderRatingSchema, req.body);
  const residentId = req.session!.userId;
  const order = await prisma.order.findFirst({
    where: { id, checkout: { residentId } },
    select: { status: true, riderId: true, finishedAt: true, checkout: { select: { paymentMethod: true, onlineMethod: true, resident: { select: { name: true } } } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  if (order.status !== "DELIVERED" || !order.riderId) throw new HttpError(400, "You can rate the rider once your order has been delivered.");
  if (order.finishedAt && Date.now() - order.finishedAt.getTime() > RATE_RIDER_DAYS * 86400_000) {
    throw new HttpError(400, `Riders can be rated for ${RATE_RIDER_DAYS} days after a delivery.`);
  }
  const riderId = order.riderId;
  const tipMethod = input.tip > 0 ? (order.checkout.paymentMethod === "ONLINE" && order.checkout.onlineMethod) || input.tipMethod : undefined;
  if (input.tip > 0 && !tipMethod) throw new HttpError(400, "Choose how to pay the tip.");

  try {
    await prisma.$transaction([
      prisma.riderRating.create({ data: { orderId: id, riderId, residentId, rating: input.rating, tags: input.tags, comment: input.comment || null } }),
      prisma.riderProfile.update({ where: { userId: riderId }, data: { ratingSum: { increment: input.rating }, ratingCount: { increment: 1 } } }),
      ...(tipMethod ? [prisma.order.update({ where: { id }, data: { tip: input.tip, tipMethod } })] : []),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "You already rated this rider.");
    }
    throw error;
  }

  const who = shortName(order.checkout.resident.name);
  const said = input.comment ? `"${input.comment.slice(0, 80)}"` : input.tags.length ? input.tags.join(" · ") : `For order ${orderCode(id)}.`;
  await notify(riderId, {
    title: tipMethod ? `${who} tipped you ₱${input.tip}` : `New ${input.rating}-star rating`,
    body: tipMethod ? `${input.rating} stars on ${orderCode(id)}. ${said}` : said,
    link: "/rider/ratings",
  });
  res.status(201).json({ ok: true, tipMethod: tipMethod ? ONLINE_LABEL[tipMethod] : null });
});

// ---------- Order again ----------

const ACTIVE_STORE_FIELDS = { status: true, owner: { select: { disabledAt: true } } } as const;

/** Puts the dishes of a past order back in the cart, skipping any that can't be ordered now. */
ordersRouter.post("/:id/reorder", async (req, res) => {
  const userId = req.session!.userId;
  const order = await prisma.order.findFirst({
    where: { id: String(req.params.id), checkout: { residentId: userId } },
    select: {
      items: {
        select: {
          name: true,
          quantity: true,
          menuItem: { select: { id: true, deletedAt: true, isAvailable: true, stock: true, vendor: { select: ACTIVE_STORE_FIELDS } } },
        },
      },
    },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");

  const inCart = new Map((await readCartQuantities(userId)).map((l) => [l.menuItemId, l.quantity]));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const { name, quantity, menuItem } of order.items) {
    const storeActive = menuItem.vendor.status === ACTIVE_STORE.status && !menuItem.vendor.owner.disabledAt;
    if (!storeActive || menuItem.deletedAt || !menuItem.isAvailable || menuItem.stock === 0) {
      skipped.push(name);
      continue;
    }
    let total = (inCart.get(menuItem.id) ?? 0) + quantity;
    if (menuItem.stock !== null) total = Math.min(total, menuItem.stock);
    await setCartQuantity(userId, menuItem.id, Math.min(total, 50));
    added.push(name);
  }
  if (added.length === 0) throw new HttpError(400, "None of these dishes can be ordered right now.");
  res.json({ added, skipped });
});
