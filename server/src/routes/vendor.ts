import { Router } from "express";
import { z } from "zod";
import type { OrderStatus, Prisma } from "../generated/prisma/client.js";
import { invalidateStore } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { broadcastOrder, notifyResident, restoreStock, settlePayment, transition } from "../lib/orders.js";
import { dailySales } from "../lib/sales.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { STORE_TYPES } from "../lib/storeTypes.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const vendorRouter = Router();
vendorRouter.use(requireAuth, requireRole("VENDOR"));

/** The signed-in vendor's store id. */
export async function myVendorId(userId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (!vendor) throw new HttpError(404, "Store not found.");
  return vendor.id;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.");
// Only accept photos uploaded through Feasto
const photo = z
  .string()
  .regex(/^\/uploads\/[\w.-]+$/, "Upload the photo again.")
  .nullable()
  .optional();

// ---------- Store settings ----------

const storeSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your store's name.").max(80),
    description: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => v || null),
    address: z.string().trim().min(5, "Enter your store's address.").max(200),
    storeType: z.enum(STORE_TYPES, "Choose your store type."),
    acceptsReservations: z.boolean(),
    opensAt: time,
    closesAt: time,
    isTemporarilyClosed: z.boolean(),
    imageUrl: photo,
  })
  .refine((v) => v.closesAt > v.opensAt, { path: ["closesAt"], message: "Closing time must be after opening time." });

vendorRouter.get("/store", async (req, res) => {
  const store = await prisma.vendor.findUniqueOrThrow({ where: { ownerId: req.session!.userId } });
  res.json({ store });
});

vendorRouter.patch("/store", async (req, res) => {
  const input = parseBody(storeSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const store = await prisma.vendor.update({ where: { id: vendorId }, data: input });
  await invalidateStore(vendorId);
  res.json({ store });
});

// ---------- Menu ----------

const menuItemSchema = z.object({
  name: z.string().trim().min(2, "Enter the dish name.").max(80),
  category: z.string().trim().min(2, "Enter a menu section, like Rice Meals.").max(40),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  price: z.coerce.number("Enter a price.").positive("Enter a price above ₱0.").max(100000).multipleOf(0.01, "Use at most 2 decimals."),
  // Blank means unlimited
  stock: z
    .union([z.literal(""), z.null(), z.coerce.number().int("Stock must be a whole number.").min(0, "Stock can't be negative.").max(100000)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  imageUrl: photo,
  isAvailable: z.boolean().default(true),
});

vendorRouter.get("/menu", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const items = await prisma.menuItem.findMany({
    where: { vendorId, deletedAt: null },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

vendorRouter.post("/menu", async (req, res) => {
  const input = parseBody(menuItemSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const count = await prisma.menuItem.count({ where: { vendorId, deletedAt: null } });
  if (count >= 200) throw new HttpError(400, "A menu can have up to 200 dishes.");
  const item = await prisma.menuItem.create({ data: { ...input, vendorId } });
  await invalidateStore(vendorId);
  res.status(201).json({ item });
});

vendorRouter.patch("/menu/:id", async (req, res) => {
  const input = parseBody(menuItemSchema.partial(), req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const { count } = await prisma.menuItem.updateMany({
    where: { id: String(req.params.id), vendorId, deletedAt: null },
    data: input,
  });
  if (count === 0) throw new HttpError(404, "Dish not found.");
  await invalidateStore(vendorId);
  res.json({ ok: true });
});

vendorRouter.delete("/menu/:id", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  // Hidden rather than deleted: past orders still point to it
  const { count } = await prisma.menuItem.updateMany({
    where: { id: String(req.params.id), vendorId, deletedAt: null },
    data: { deletedAt: new Date(), isAvailable: false },
  });
  if (count === 0) throw new HttpError(404, "Dish not found.");
  await invalidateStore(vendorId);
  res.status(204).end();
});

// ---------- Orders ----------

const ORDER_TABS = {
  new: ["PLACED"],
  preparing: ["ACCEPTED", "PREPARING"],
  ready: ["READY", "PICKED_UP"],
  done: ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"],
} as const satisfies Record<string, OrderStatus[]>;

vendorRouter.get("/orders", async (req, res) => {
  const tab = z.enum(["new", "preparing", "ready", "done"]).catch("new").parse(req.query.tab);
  const vendorId = await myVendorId(req.session!.userId);

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { vendorId, status: { in: [...ORDER_TABS[tab]] } },
      orderBy: { createdAt: tab === "done" ? "desc" : "asc" },
      take: 100,
      include: {
        items: { select: { id: true, name: true, quantity: true, unitPrice: true } },
        rider: { select: { name: true, phone: true } },
        checkout: { select: { paymentMethod: true, paymentStatus: true, deliveryAddress: true, notes: true, resident: { select: { name: true, phone: true } } } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], where: { vendorId, status: { not: "AWAITING_PAYMENT" } }, _count: true }),
  ]);
  const count = (statuses: readonly OrderStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);

  res.json({
    tab,
    orders,
    counts: { new: count(ORDER_TABS.new), preparing: count(ORDER_TABS.preparing), ready: count(ORDER_TABS.ready), done: count(ORDER_TABS.done) },
  });
});

const rejectSchema = z.object({ reason: z.string().trim().min(3, "Tell the resident why.").max(200) });

/** One step of an order, done by the store. */
async function vendorStep(
  userId: string,
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  extra: Prisma.OrderUncheckedUpdateManyInput,
  options: { pickupOnly?: boolean; restore?: boolean } = {},
) {
  const vendorId = await myVendorId(userId);
  const order = await prisma.order.findFirst({ where: { id: orderId, vendorId }, select: { checkoutId: true, fulfillment: true } });
  if (!order) throw new HttpError(404, "Order not found.");
  if (options.pickupOnly && order.fulfillment !== "PICKUP") throw new HttpError(400, "Delivery orders are completed by the rider.");

  await prisma.$transaction(async (tx) => {
    await transition(tx, orderId, from, to, extra, { vendorId });
    if (options.restore) await restoreStock(tx, orderId);
    await settlePayment(tx, order.checkoutId);
  });
  if (options.restore) await invalidateStore(vendorId);
  await notifyResident(orderId);
  await broadcastOrder(orderId);
}

vendorRouter.post("/orders/:id/accept", async (req, res) => {
  await vendorStep(req.session!.userId, String(req.params.id), ["PLACED"], "ACCEPTED", { acceptedAt: new Date() });
  res.json({ ok: true });
});

vendorRouter.post("/orders/:id/reject", async (req, res) => {
  const { reason } = parseBody(rejectSchema, req.body);
  await vendorStep(req.session!.userId, String(req.params.id), ["PLACED"], "REJECTED", { rejectReason: reason, finishedAt: new Date() }, { restore: true });
  res.json({ ok: true });
});

vendorRouter.post("/orders/:id/preparing", async (req, res) => {
  await vendorStep(req.session!.userId, String(req.params.id), ["ACCEPTED"], "PREPARING", {});
  res.json({ ok: true });
});

vendorRouter.post("/orders/:id/ready", async (req, res) => {
  await vendorStep(req.session!.userId, String(req.params.id), ["ACCEPTED", "PREPARING"], "READY", { readyAt: new Date() });
  res.json({ ok: true });
});

/** Pickup orders: the resident collected it at the counter. */
vendorRouter.post("/orders/:id/complete", async (req, res) => {
  await vendorStep(req.session!.userId, String(req.params.id), ["READY"], "COMPLETED", { finishedAt: new Date() }, { pickupOnly: true });
  res.json({ ok: true });
});

// ---------- Dashboard numbers ----------

const daysQuery = z.object({ days: z.coerce.number().int().min(7).max(90).default(14) });

vendorRouter.get("/sales", async (req, res) => {
  const { days } = daysQuery.parse(req.query);
  res.json({ days: await dailySales(days, await myVendorId(req.session!.userId)) });
});

/** The latest ratings, with the store's average. */
vendorRouter.get("/reviews", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const [store, reviews, stars] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { ratingSum: true, ratingCount: true } }),
    prisma.review.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, rating: true, comment: true, createdAt: true, orderId: true, resident: { select: { name: true } } },
    }),
    prisma.review.groupBy({ by: ["rating"], where: { vendorId }, _count: true }),
  ]);
  res.json({
    rating: store.ratingCount ? Math.round((store.ratingSum / store.ratingCount) * 10) / 10 : null,
    ratingCount: store.ratingCount,
    // How many 5-star, 4-star ... 1-star ratings, in that order
    distribution: [5, 4, 3, 2, 1].map((n) => stars.find((s) => s.rating === n)?._count ?? 0),
    reviews,
  });
});

vendorRouter.get("/overview", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const startOfDay = manilaStartOfDay();
  const since = new Date(startOfDay.getTime() - 13 * 86400_000);
  const [today, pending, inKitchen, dishes, tables, upcomingBookings, ratings, best] = await Promise.all([
    prisma.order.findMany({
      where: { vendorId, createdAt: { gte: startOfDay }, status: { notIn: ["AWAITING_PAYMENT", "REJECTED", "CANCELLED"] } },
      select: { subtotal: true },
    }),
    prisma.order.count({ where: { vendorId, status: "PLACED" } }),
    prisma.order.count({ where: { vendorId, status: { in: ["ACCEPTED", "PREPARING"] } } }),
    prisma.menuItem.count({ where: { vendorId, deletedAt: null } }),
    prisma.diningTable.count({ where: { vendorId, isActive: true } }),
    prisma.booking.count({ where: { table: { vendorId }, status: "CONFIRMED", startsAt: { gte: new Date() } } }),
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { ratingSum: true, ratingCount: true } }),
    // Best sellers over the same 14 days as the sales chart
    prisma.$queryRaw<{ name: string; quantity: bigint; sales: string }[]>`
      SELECT i.name, sum(i.quantity) AS quantity, sum(i.quantity * i."unitPrice")::text AS sales
      FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o."vendorId" = ${vendorId} AND o."createdAt" >= ${since}
        AND o.status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      GROUP BY i.name ORDER BY quantity DESC, i.name LIMIT 5`,
  ]);
  res.json({
    ordersToday: today.length,
    salesToday: today.reduce((sum, o) => sum + Number(o.subtotal), 0),
    pending,
    inKitchen,
    dishes,
    tables,
    upcomingBookings,
    rating: ratings.ratingCount ? Math.round((ratings.ratingSum / ratings.ratingCount) * 10) / 10 : null,
    ratingCount: ratings.ratingCount,
    bestSellers: best.map((b) => ({ name: b.name, quantity: Number(b.quantity), sales: Number(b.sales) })),
  });
});
