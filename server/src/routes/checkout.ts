import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import { config } from "../config.js";
import { Prisma } from "../generated/prisma/client.js";
import { invalidateStore } from "../lib/redisCache.js";
import { ONLINE_PAYMENTS, storeRefusing } from "../lib/payments.js";
import { buildCart, clearCart } from "../lib/cart.js";
import { chosenRider } from "../lib/errands.js";
import { prisma } from "../lib/db.js";
import { feastoShare } from "../lib/earnings.js";
import { addOnTotal, addOnNote } from "../lib/feeAddOns.js";
import { HttpError, parseBody } from "../lib/http.js";
import { enqueue } from "../lib/outbox.js";
import { startOnlinePayment, syncPayment } from "../lib/paymentFlow.js";
import { QUEUES } from "../lib/rabbitmq.js";
import { perAccount } from "../lib/rateLimit.js";
import { announceScheduled, scheduleProblem } from "../lib/schedule.js";
import { getSettings } from "../lib/settings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { refuseWithoutId } from "../lib/identity.js";
import { accountLine, walletOfChannel } from "../lib/transfers.js";
import { refuseIfSuspended } from "../lib/userReports.js";
import { orderDiscountData, pricePromos, type PromoGroup } from "../lib/promos.js";
import { deviceOf } from "../lib/twoStep.js";

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth, requireRole("RESIDENT"));

const checkoutSchema = z
  .object({
    /** Made once by the checkout page; a double-click or retry sends the same key */
    idempotencyKey: z.string().min(8).max(100),
    fulfillment: z.enum(["DELIVERY", "PICKUP"]),
    addressId: z.string().optional(),
    paymentMethod: z.enum(["COD", "ONLINE"]),
    /** The e-wallet or card, for online payments */
    onlineMethod: z.enum(ONLINE_PAYMENTS).optional(),
    /** Paying by transfer to one of Feasto's own accounts (the admin's list) instead of on Xendit's page */
    transferAccountId: z.string().min(1).optional(),
    notes: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || null),
    /** The delivery fees the page showed, all stores together. If they changed since (the rush
     *  started, the admin changed the prices), the resident sees the new total first. */
    expectedDeliveryFee: z.number().optional(),
    /** Ordered for later: when to deliver it (or have it ready). Left out for as soon as possible. */
    scheduledFor: z.iso.datetime({ offset: true }).optional(),
    /** A rider the resident chose: the delivery reaches them alone first (one store, delivery only) */
    preferredRiderId: z.string().min(1).optional(),
    /** Demo switch: make the simulated online payment fail to show the saga undoing the order */
    simulatePaymentFailure: z.boolean().optional(),
    /** What the store does if an item runs out after the order is placed */
    ifUnavailable: z.enum(["REMOVE", "CALL", "CANCEL"]).optional().default("REMOVE"),
    /** One voucher for the food, one for the delivery, and the Senior Citizen or PWD discount */
    voucherCode: z.string().trim().max(30).nullish().transform((v) => v || null),
    deliveryCode: z.string().trim().max(30).nullish().transform((v) => v || null),
    senior: z.boolean().optional().default(false),
    /** Spend Suki points too */
    usePoints: z.boolean().optional().default(false),
    /** No spoon and fork; leave it at the gate (paid online only) */
    noCutlery: z.boolean().optional().default(false),
    leaveAtGate: z.boolean().optional().default(false),
    /** The discount the page showed; if it changed (a voucher ran out), the resident sees the new total first */
    expectedDiscount: z.number().optional(),
  })
  .refine((v) => v.fulfillment === "PICKUP" || v.addressId, { path: ["addressId"], message: "Choose where to deliver." });

const checkoutSummary = { id: true, paymentStatus: true, paymentUrl: true, transferAccountId: true, orders: { select: { id: true } } } as const;

/** Where the resident's browser opened Feasto, so the payment page can send them back to it */
const fourDigits = () => String(randomInt(10000)).padStart(4, "0");

export function originOf(req: Request) {
  const origin = req.get("origin");
  if (origin && /^https?:\/\/[\w.:-]+$/.test(origin)) return origin;
  return `${req.protocol}://${req.get("host")}`;
}

/** A checkout still waiting for its online payment keeps its payment page, so a retry goes back to it */
const pendingPage = (c: { paymentStatus: string; paymentUrl: string | null }) => (c.paymentStatus === "PENDING" ? c.paymentUrl : null);

checkoutRouter.post("/", perAccount("checkout", 10, 300, "You've placed a lot of orders just now."), async (req, res) => {
  const input = parseBody(checkoutSchema, req.body);
  const userId = req.session!.userId;
  await refuseIfSuspended(userId, "order");
  if (input.paymentMethod === "COD") await refuseWithoutId(userId, "cod");

  // Same key again (double-click, network retry): return the checkout we already made
  const existing = await prisma.checkout.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { ...checkoutSummary, residentId: true } });
  if (existing) {
    if (existing.residentId !== userId) throw new HttpError(409, "Please refresh the page and try again.");
    res.json({ checkoutId: existing.id, orderIds: existing.orders.map((o) => o.id), paymentUrl: pendingPage(existing), transfer: Boolean(existing.transferAccountId), repeated: true });
    return;
  }

  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const cart = await buildCart(userId, input.fulfillment === "DELIVERY" ? input.addressId : undefined, scheduledFor ?? undefined);
  if (cart.groups.length === 0) throw new HttpError(400, "Your cart is empty.");
  // A store that's closed right now can still take an order for later, within its hours
  if (cart.hasProblems && !(scheduledFor && cart.canSchedule)) {
    const closed = cart.canSchedule ? cart.groups.find((g) => g.problem === "STORE_CLOSED") : null;
    throw new HttpError(409, closed ? `${closed.store.name} is closed right now. Schedule your order for when it's open.` : "Some items in your cart changed. Check your cart and try again.");
  }
  if (scheduledFor) {
    const problem = scheduleProblem(scheduledFor, input.fulfillment, cart.groups.map((g) => g.store));
    if (problem) throw new HttpError(400, problem);
  }
  // Deliveries paused for the whole town (a storm, a flood): pickup, or later once it's over
  const settingsNow = await getSettings();
  if (input.fulfillment === "DELIVERY" && settingsNow.deliveryPausedUntil && (!scheduledFor || scheduledFor < new Date(settingsNow.deliveryPausedUntil))) {
    const until = new Date(settingsNow.deliveryPausedUntil).toLocaleString("en-PH", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric", timeZone: "Asia/Manila" });
    throw new HttpError(409, `Deliveries are paused until ${until}${settingsNow.deliveryPauseReason ? ` (${settingsNow.deliveryPauseReason})` : ""}, to keep riders safe. Choose pickup, or schedule it for after that.`);
  }
  // A store's minimum order, for delivery
  const short = input.fulfillment === "DELIVERY" ? cart.groups.find((g) => g.minOrder && g.minOrder.short > 0) : null;
  if (short?.minOrder) throw new HttpError(400, `${short.store.name}'s minimum for delivery is ₱${short.minOrder.amount}. Add ₱${short.minOrder.short} more, or choose pickup.`);
  if (input.leaveAtGate && input.paymentMethod !== "ONLINE") throw new HttpError(400, "\"Leave it at the gate\" is for orders paid online: the rider has to collect cash in person.");
  // Each store delivers only as far as it set
  const far = input.fulfillment === "DELIVERY" ? cart.groups.find((g) => g.tooFar) : null;
  if (far?.tooFar) {
    throw new HttpError(400, `${far.store.name} delivers up to ${far.tooFar.radiusKm} km, and this address is ${far.tooFar.km} km away by road. Choose pickup, another address, or a nearer store.`);
  }
  // A big order some stores need to know about ahead of time
  const rush = cart.groups.find((g) => g.timing.noticeMinutes > 0 && (!scheduledFor || scheduledFor.getTime() < Date.now() + g.timing.noticeMinutes * 60_000));
  if (rush) {
    const earliest = new Date(Date.now() + rush.timing.noticeMinutes * 60_000).toLocaleString("en-PH", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric", timeZone: "Asia/Manila" });
    const notice = rush.timing.noticeMinutes >= 60 ? `${Math.round((rush.timing.noticeMinutes / 60) * 10) / 10} hours'` : `${rush.timing.noticeMinutes} minutes'`;
    throw new HttpError(400, `This is a big order, and ${rush.store.name} needs ${notice} notice for it. Schedule it for ${earliest} or later.`);
  }

  // A transfer goes to one of the admin's accounts, never to one the request names
  const transferAccount = input.transferAccountId
    ? await prisma.receivingAccount.findFirst({ where: { id: input.transferAccountId, enabled: true } })
    : null;
  if (input.transferAccountId && (!transferAccount || input.paymentMethod !== "ONLINE")) throw new HttpError(409, "That account isn't taking payments anymore. Choose another way to pay.");
  const transferWallet = transferAccount ? walletOfChannel(transferAccount.channel) : null;

  // Each store chooses the ways to pay it takes; one payment covers the whole cart, so every store must take it
  const refusing = storeRefusing(
    cart.groups.map((g) => g.store),
    input.paymentMethod === "COD" ? "COD" : transferAccount ? (transferWallet ?? "ONLINE") : (input.onlineMethod ?? "ONLINE"),
  );
  if (refusing) throw new HttpError(409, `${refusing.name} doesn't take ${input.paymentMethod === "COD" ? "cash" : "this way to pay"}. Choose another way to pay.`);

  // The rider the resident asked for. For later, they only need to be a free rider now; whether
  // they're online is checked when the job goes out (otherwise it goes to the nearest riders).
  let preferredRiderId: string | null = null;
  if (input.preferredRiderId) {
    if (input.fulfillment !== "DELIVERY") throw new HttpError(400, "A rider can only be chosen for a delivery.");
    if (cart.groups.length !== 1) throw new HttpError(400, "A rider can be chosen when the order is from one store. Remove the choice, or order from each store separately.");
    if (scheduledFor) {
      const rider = await prisma.riderProfile.findFirst({ where: { userId: input.preferredRiderId, vendorId: null, status: "APPROVED" }, select: { userId: true } });
      if (!rider) throw new HttpError(409, "That rider can't take deliveries now. Choose another rider.");
      preferredRiderId = rider.userId;
    } else {
      preferredRiderId = (await chosenRider(input.preferredRiderId)).id;
    }
  }

  let deliveryAddress: string | null = null;
  let deliveryPin: { deliveryLat: number | null; deliveryLng: number | null } = { deliveryLat: null, deliveryLng: null };
  if (input.fulfillment === "DELIVERY") {
    const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw new HttpError(400, "Choose where to deliver.");
    deliveryAddress = [address.details, address.landmark].filter(Boolean).join(" · ");
    deliveryPin = { deliveryLat: address.latitude, deliveryLng: address.longitude };
  }

  // Each store's fee was priced for the distance from it to this address
  const delivery = input.fulfillment === "DELIVERY";
  const feeOf = (group: (typeof cart.groups)[number]) => (delivery ? (group.delivery?.fee ?? cart.delivery.baseFee) : 0);
  const deliveryTotal = Math.round(cart.groups.reduce((n, g) => n + feeOf(g), 0) * 100) / 100;
  if (delivery && input.expectedDeliveryFee !== undefined && Math.abs(input.expectedDeliveryFee - deliveryTotal) > 0.001) {
    const why = cart.groups.some((g) => g.delivery?.busyFee || g.delivery?.rainFee || g.delivery?.daloyFee) ? " Riders are busy, it's raining or the road is slow now, so an add-on for the rider applies." : "";
    throw new HttpError(409, `The delivery fee changed to ₱${deliveryTotal}.${why} Check the new total, then place your order again.`);
  }
  // The promos, worked out the same way as the checkout page did (and again, held, when saving)
  const promoGroups: PromoGroup[] = cart.groups.map((g) => ({
    storeId: g.store.id,
    storeName: g.store.name,
    items: g.items.map((i) => ({ menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity })),
    subtotal: g.subtotal,
    deliveryFee: feeOf(g),
  }));
  const promoInput = { userId, groups: promoGroups, fulfillment: input.fulfillment, voucherCode: input.voucherCode, deliveryCode: input.deliveryCode, senior: input.senior, usePoints: input.usePoints, deviceHash: deviceOf(req, res) };
  const pricing = await pricePromos(prisma, promoInput);
  const refused = [pricing.voucher, pricing.deliveryVoucher].find((v) => v && !v.applied && v.message && !v.message.startsWith("Not used"));
  if (refused) throw new HttpError(409, `${refused.code}: ${refused.message}`);
  if (input.expectedDiscount !== undefined && Math.abs(input.expectedDiscount - pricing.discount) > 0.001) {
    throw new HttpError(409, `Your discount changed to ₱${pricing.discount}. Check the new total, then place your order again.`);
  }
  const total = Math.round((cart.itemsTotal + deliveryTotal - pricing.discount) * 100) / 100;

  // Cash has limits, so a store never cooks a big order for someone who never pays
  if (input.paymentMethod === "COD") {
    const [limits, me] = await Promise.all([getSettings(), prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { noShows: true } })]);
    if (me.noShows >= limits.noShowStrikes) {
      throw new HttpError(400, `Cash on delivery is off for your account: ${me.noShows} orders weren't received at the door. Pay online instead.`);
    }
    if (total > limits.codMaxAmount) {
      throw new HttpError(400, `Cash on delivery is for orders up to ₱${limits.codMaxAmount.toLocaleString("en-PH")}. Pay online for this one, so the store can cook a big order safely.`);
    }
  }

  // Feasto's share, copied onto each order like its fee. A store in its free first month pays no commission.
  const [rates, freeUntil] = await Promise.all([
    getSettings(),
    prisma.vendor.findMany({ where: { id: { in: cart.groups.map((g) => g.store.id) } }, select: { id: true, commissionFreeUntil: true, commissionPercent: true, pickupCommissionPercent: true } }),
  ]);
  const storeOf = new Map(freeUntil.map((v) => [v.id, v]));
  // The commission is on the food money the store keeps: after the discounts the store pays for
  const shareOf = (group: (typeof cart.groups)[number], storeDiscount: number) => {
    const store = storeOf.get(group.store.id);
    return feastoShare({ fulfillment: input.fulfillment, subtotal: Math.max(0, group.subtotal - storeDiscount), commissionFreeUntil: store?.commissionFreeUntil ?? null }, rates, store);
  };
  // The busy, rain or slow-road add-on in each store's fee, kept on the order with the reason
  const addOnOf = (group: (typeof cart.groups)[number]) =>
    delivery && group.delivery ? { extraFee: addOnTotal(group.delivery), extraFeeNote: addOnNote(group.delivery), daloyFee: group.delivery.daloyFee ?? 0 } : {};

  try {
    const checkout = await prisma.$transaction(async (tx) => {
      // Each voucher held while its uses are counted, so two checkouts can't share its last use
      const held = await pricePromos(tx, { ...promoInput, lock: true });
      if (Math.abs(held.discount - pricing.discount) > 0.001) throw new HttpError(409, "Your discounts just changed (a voucher ran out or your points were used). Check your total, then place your order again.");
      const priceOf = new Map(held.groups.map((g) => [g.storeId, g]));
      // Reserve stock with a conditional update: it only succeeds while enough is left,
      // so two residents can't both buy the last plate, even through different API copies.
      for (const group of cart.groups) {
        for (const item of group.items) {
          if (item.stock === null) continue;
          const { count } = await tx.menuItem.updateMany({
            where: { id: item.menuItemId, stock: { gte: item.quantity }, deletedAt: null, isAvailable: true },
            data: { stock: { decrement: item.quantity } },
          });
          if (count === 0) throw new HttpError(409, `${item.name} just sold out. Check your cart and try again.`);
        }
      }

      const created = await tx.checkout.create({
        data: {
          residentId: userId,
          idempotencyKey: input.idempotencyKey,
          ifUnavailable: input.ifUnavailable,
          fulfillment: input.fulfillment,
          paymentMethod: input.paymentMethod,
          onlineMethod: input.paymentMethod === "ONLINE" ? (transferAccount ? transferWallet : (input.onlineMethod ?? null)) : null,
          ...(transferAccount && { transferAccountId: transferAccount.id, transferTo: accountLine(transferAccount) }),
          deliveryAddress,
          ...deliveryPin,
          notes: input.notes,
          noCutlery: input.noCutlery,
          leaveAtGate: delivery && input.leaveAtGate,
          total,
          discount: held.discount,
          // One order per store; online orders wait for the payment first
          orders: {
            create: cart.groups.map((group) => ({
              vendorId: group.store.id,
              fulfillment: input.fulfillment,
              // Online orders wait for the payment first; scheduled ones then wait for their time
              status: input.paymentMethod === "ONLINE" ? "AWAITING_PAYMENT" : scheduledFor ? "SCHEDULED" : "PLACED",
              scheduledFor,
              preferredRiderId,
              subtotal: group.subtotal,
              deliveryFee: feeOf(group),
              deliveryKm: delivery ? (group.delivery?.km ?? null) : null,
              // Read out by the rider at the store; given by the resident at the door (big orders)
              pickupCode: fourDigits(),
              handoverPin: delivery ? fourDigits() : null,
              ...shareOf(group, priceOf.get(group.store.id)?.storeDiscount ?? 0),
              ...addOnOf(group),
              ...orderDiscountData(priceOf.get(group.store.id)),
              items: {
                create: group.items.map((item) => ({
                  menuItemId: item.menuItemId,
                  name: item.name,
                  unitPrice: item.price,
                  quantity: item.quantity,
                  note: item.note,
                  discount: priceOf.get(group.store.id)?.itemDiscounts[item.menuItemId] ?? 0,
                })),
              },
            })),
          },
        },
        select: { ...checkoutSummary, orders: { select: { id: true, vendorId: true } } },
      });

      // Each promo used, on each order: counts its uses and Feasto's spending, live
      const uses = created.orders.flatMap((o) =>
        (priceOf.get(o.vendorId)?.lines ?? [])
          .filter((l) => l.promoId)
          .map((l) => ({ promoId: l.promoId!, userId, orderId: o.id, amount: l.amount, feastoAmount: l.feasto, storeAmount: l.store })),
      );
      if (uses.length) await tx.promoUse.createMany({ data: uses });

      if (input.paymentMethod === "ONLINE") {
        // Real payments open Xendit's payment page after this commits; the simulation is a queued job
        // A transfer waits for the resident to send it and the admin to check it (routes/transfers.ts)
        if (config.payments === "simulated" && !transferAccount) await enqueue(tx, QUEUES.paymentRequested, { checkoutId: created.id, simulateFailure: Boolean(input.simulatePaymentFailure) });
      } else if (!scheduledFor) {
        for (const order of created.orders) await enqueue(tx, QUEUES.ordersPlaced, { orderId: order.id });
      }
      return created;
    });

    await clearCart(userId);
    await Promise.all(cart.groups.map((g) => invalidateStore(g.store.id))); // stock changed
    // Card or e-wallet through Xendit: the resident pays on Xendit's page, which sends them back after
    if (transferAccount) {
      res.status(201).json({ checkoutId: checkout.id, orderIds: checkout.orders.map((o) => o.id), transfer: true });
      return;
    }
    if (input.paymentMethod === "ONLINE" && config.payments === "xendit") {
      const paymentUrl = await startOnlinePayment(checkout.id, originOf(req));
      if (!paymentUrl) throw new HttpError(502, "We couldn't open the payment page, so your order was cancelled and the items went back to the store. Check your connection and try again, or pay with cash.");
      res.status(201).json({ checkoutId: checkout.id, orderIds: checkout.orders.map((o) => o.id), paymentUrl });
      return;
    }
    // A cash order for later is booked already: let the stores know it's coming
    if (scheduledFor && input.paymentMethod === "COD") await Promise.all(checkout.orders.map((o) => announceScheduled(o.id)));
    res.status(201).json({ checkoutId: checkout.id, orderIds: checkout.orders.map((o) => o.id) });
  } catch (error) {
    // Two requests with the same key at the same moment: the unique index lets one in
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.checkout.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey }, select: checkoutSummary });
      res.json({ checkoutId: winner.id, orderIds: winner.orders.map((o) => o.id), paymentUrl: pendingPage(winner), repeated: true });
      return;
    }
    throw error;
  }
});

/** What the checkout page shows before ordering: each store's discounts, the vouchers' answers, and the total */
checkoutRouter.post("/quote", async (req, res) => {
  const input = parseBody(
    z.object({
      fulfillment: z.enum(["DELIVERY", "PICKUP"]),
      addressId: z.string().optional(),
      scheduledFor: z.iso.datetime({ offset: true }).optional(),
      voucherCode: z.string().trim().max(30).nullish().transform((v) => v || null),
      deliveryCode: z.string().trim().max(30).nullish().transform((v) => v || null),
      senior: z.boolean().optional().default(false),
      usePoints: z.boolean().optional().default(false),
    }),
    req.body,
  );
  const userId = req.session!.userId;
  const cart = await buildCart(userId, input.fulfillment === "DELIVERY" ? input.addressId : undefined, input.scheduledFor ? new Date(input.scheduledFor) : undefined);
  const delivery = input.fulfillment === "DELIVERY";
  const groups: PromoGroup[] = cart.groups.map((g) => ({
    storeId: g.store.id,
    storeName: g.store.name,
    items: g.items.map((i) => ({ menuItemId: i.menuItemId, name: i.name, price: i.price, quantity: i.quantity })),
    subtotal: g.subtotal,
    deliveryFee: delivery ? (g.delivery?.fee ?? cart.delivery.baseFee) : 0,
  }));
  const pricing = await pricePromos(prisma, { userId, groups, fulfillment: input.fulfillment, voucherCode: input.voucherCode, deliveryCode: input.deliveryCode, senior: input.senior, usePoints: input.usePoints, deviceHash: deviceOf(req, res) });
  const deliveryTotal = Math.round(groups.reduce((n, g) => n + g.deliveryFee, 0) * 100) / 100;
  res.json({
    ...pricing,
    stores: groups.map((g) => ({ id: g.storeId, name: g.storeName })),
    itemsTotal: cart.itemsTotal,
    deliveryTotal,
    total: Math.round((cart.itemsTotal + deliveryTotal - pricing.discount) * 100) / 100,
  });
});

/**
 * How a checkout's online payment went, for the page the resident lands on when Xendit sends them
 * back. Asks Xendit directly too, so it works even where Xendit's webhook can't reach Feasto
 * (the classroom laptop on WiFi).
 */
checkoutRouter.get("/:id/payment", async (req, res) => {
  const id = String(req.params.id);
  const mine = await prisma.checkout.findFirst({ where: { id, residentId: req.session!.userId }, select: { id: true } });
  if (!mine) throw new HttpError(404, "We couldn't find this order.");
  if (config.payments === "xendit") await syncPayment(id).catch(() => null); // Xendit unreachable: show what Feasto knows
  const checkout = await prisma.checkout.findUniqueOrThrow({
    where: { id },
    select: { paymentStatus: true, paymentUrl: true, onlineMethod: true, paidChannel: true, total: true, orders: { select: { id: true, status: true, rejectReason: true } } },
  });
  res.json({
    status: checkout.paymentStatus,
    paymentUrl: pendingPage(checkout),
    onlineMethod: checkout.onlineMethod,
    total: checkout.total,
    orderIds: checkout.orders.map((o) => o.id),
    reason: checkout.orders.find((o) => o.rejectReason)?.rejectReason ?? null,
  });
});
