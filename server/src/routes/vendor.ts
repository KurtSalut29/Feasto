import { Router } from "express";
import { z } from "zod";
import { PIN_MESSAGE, pinFields, pinIsWhole } from "../lib/geo.js";
import type { OrderStatus, Prisma } from "../generated/prisma/client.js";
import { invalidateStore } from "../lib/redisCache.js";
import { autoCancelAt } from "../lib/autoCancel.js";
import { prisma } from "../lib/db.js";
import { getSettings } from "../lib/settings.js";
import { HttpError, parseBody } from "../lib/http.js";
import { broadcastOrder, notifyResident, restoreStock, settlePayment, transition } from "../lib/orders.js";
import { BUSY } from "../lib/dispatch.js";
import { enqueue } from "../lib/outbox.js";
import { QUEUES } from "../lib/rabbitmq.js";
import { busyMinutes, etaOf, prepEstimate, rideMinutes } from "../lib/eta.js";
import { notify } from "../lib/liveUpdates.js";
import { orderCode } from "../lib/orders.js";
import { ONLINE_PAYMENTS } from "../lib/payments.js";
import { unmarshal } from "../lib/marshalling.js";
import { redis } from "../lib/redis.js";
import { dailySales, weekTrend } from "../lib/sales.js";
import { periodSchema } from "../lib/reportDates.js";
import { payoutWords } from "../lib/earnings.js";
import { storeDocument } from "../lib/reportExport/document.js";
import { exportFormat, onScreen, sendReport } from "../lib/reportExport/index.js";
import { storeReport } from "../lib/storeReport.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { STORE_TYPES } from "../lib/storeTypes.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const vendorRouter = Router();
vendorRouter.use(requireAuth, requireRole("VENDOR"));

/** The signed-in vendor's store id. */
export async function myVendorId(userId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (!vendor) throw new HttpError(404, "We couldn't find this store.");
  return vendor.id;
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00.");
// Closing can also be 24:00, midnight at the end of the day: 00:00–24:00 is open 24 hours
const closingTime = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use a time like 21:00.");
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
    closesAt: closingTime,
    isTemporarilyClosed: z.boolean(),
    imageUrl: photo,
    // Left out, the store keeps the ways to pay it already takes
    acceptsCash: z.boolean().optional(),
    onlinePayments: z
      .array(z.enum(ONLINE_PAYMENTS))
      .max(ONLINE_PAYMENTS.length)
      .transform((list) => ONLINE_PAYMENTS.filter((m) => list.includes(m)))
      .optional(),
    ...pinFields,
  })
  .refine((v) => v.closesAt > v.opensAt, { path: ["closesAt"], message: "Closing time must be after opening time." })

  .refine(pinIsWhole, PIN_MESSAGE);

vendorRouter.get("/store", async (req, res) => {
  const store = await prisma.vendor.findUniqueOrThrow({ where: { ownerId: req.session!.userId } });
  res.json({ store });
});

vendorRouter.patch("/store", async (req, res) => {
  const input = parseBody(storeSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  if (input.acceptsCash !== undefined || input.onlinePayments !== undefined) {
    const now = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { acceptsCash: true, onlinePayments: true } });
    const cash = input.acceptsCash ?? now.acceptsCash;
    const online = input.onlinePayments ?? now.onlinePayments;
    if (!cash && online.length === 0) throw new HttpError(400, "Take at least one way to pay, so residents can order.");
  }
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
  if (count === 0) throw new HttpError(404, "We couldn't find this dish. It may have been deleted.");
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
  if (count === 0) throw new HttpError(404, "We couldn't find this dish. It may have been deleted.");
  await invalidateStore(vendorId);
  res.status(204).end();
});

// ---------- Orders ----------

const ORDER_TABS = {
  /** Everything the store is still handling, as one queue: first come, first served */
  active: ["PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP"],
  new: ["PLACED"],
  /** Ordered for later: shown so the store can plan, sent to accept a while before the time */
  scheduled: ["SCHEDULED"],
  preparing: ["ACCEPTED", "PREPARING"],
  ready: ["READY", "PICKED_UP"],
  done: ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"],
} as const satisfies Record<string, OrderStatus[]>;

/** Finished orders shown per page in the store's order history */
const HISTORY_PAGE_SIZE = 20;

/** What the store sees of an order: the dishes (with photos), the rider and the customer */
const vendorOrderInclude = {
  items: { select: { id: true, name: true, quantity: true, unitPrice: true, note: true, removedAt: true, menuItem: { select: { imageUrl: true } } } },
  rider: { select: { name: true, phone: true, riderProfile: { select: { vehicleModel: true, plateNumber: true } } } },
  checkout: {
    select: {
      paymentMethod: true,
      onlineMethod: true,
      paymentStatus: true,
      deliveryAddress: true,
      deliveryLat: true,
      deliveryLng: true,
      notes: true,
      ifUnavailable: true,
      resident: { select: { name: true, phone: true } },
    },
  },
} satisfies Prisma.OrderInclude;

/** Where each rider is right now, for orders a rider is on (kept in Redis while they deliver) */
async function withRiderLocations<T extends { id: string; riderId: string | null; status: OrderStatus }>(orders: T[]) {
  const riding = orders.filter((o) => o.riderId && BUSY.includes(o.status));
  const found = riding.length ? await redis.mget(...riding.map((o) => `rider-location:${o.id}`)) : [];
  const at = new Map(
    riding.map((o, i) => [
      o.id,
      found[i] ? unmarshal<{ lat: number; lng: number; at: string }>(found[i]!, { transport: "redis", channel: `rider-location:${o.id}`, kind: "rider location" }) : null,
    ]),
  );
  return orders.map((o) => ({ ...o, riderLocation: at.get(o.id) ?? null }));
}

/** One order in full, for the store's order page and printed slip. */
vendorRouter.get("/orders/:id", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const order = await prisma.order.findFirst({
    where: { id: String(req.params.id), vendorId },
    include: { ...vendorOrderInclude, vendor: { select: { name: true, address: true, latitude: true, longitude: true, imageUrl: true, owner: { select: { phone: true } } } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  const [withLocation] = await withRiderLocations([order]);
  const prep = await prisma.vendor.findUniqueOrThrow({ where: { id: order.vendorId }, select: { prepMinutes: true, prepPer5Items: true, busyExtraMinutes: true, busyUntil: true } });
  const count = order.items.filter((i) => !i.removedAt).reduce((n, i) => n + i.quantity, 0);
  res.json({ order: { ...withLocation!, eta: etaOf(order), estimateMinutes: prepEstimate(prep, count) } });
});

vendorRouter.get("/orders", async (req, res) => {
  const tab = z.enum(["active", "new", "scheduled", "preparing", "ready", "done"]).catch("new").parse(req.query.tab);
  const vendorId = await myVendorId(req.session!.userId);
  // History grows forever, so it comes a page at a time (newest first); the queues stay whole
  const history = tab === "done";
  const page = history ? z.coerce.number().int().min(1).max(10_000).catch(1).parse(req.query.page ?? 1) : 1;

  const [orders, counts] = await Promise.all([
    prisma.order.findMany({
      where: { vendorId, status: { in: [...ORDER_TABS[tab]] } },
      // Waiting orders in the order they reached the store; scheduled ones by their time
      orderBy: history ? [{ createdAt: "desc" }, { id: "desc" }] : tab === "scheduled" ? { scheduledFor: "asc" } : { placedAt: "asc" },
      skip: history ? (page - 1) * HISTORY_PAGE_SIZE : 0,
      take: history ? HISTORY_PAGE_SIZE : 100,
      include: vendorOrderInclude,
    }),
    prisma.order.groupBy({ by: ["status"], where: { vendorId, status: { not: "AWAITING_PAYMENT" } }, _count: true }),
  ]);
  const count = (statuses: readonly OrderStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);

  // When each waiting order will be cancelled by itself, so the store sees the deadline
  const [{ autoCancelMinutes }, prep] = await Promise.all([
    getSettings(),
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { prepMinutes: true, prepPer5Items: true, busyExtraMinutes: true, busyUntil: true } }),
  ]);
  // Feasto's estimate, picked for the store when it accepts
  const estimate = (o: { items: { quantity: number; removedAt: Date | null }[] }) => prepEstimate(prep, o.items.filter((i) => !i.removedAt).reduce((n, i) => n + i.quantity, 0));
  res.json({
    tab,
    busy: { minutes: busyMinutes(prep), until: prep.busyUntil && busyMinutes(prep) ? prep.busyUntil : null },
    orders: (await withRiderLocations(orders)).map((o) => ({ ...o, autoCancel: autoCancelAt(o, autoCancelMinutes), eta: etaOf(o), estimateMinutes: estimate(o) })),
    counts: { new: count(ORDER_TABS.new), scheduled: count(ORDER_TABS.scheduled), preparing: count(ORDER_TABS.preparing), ready: count(ORDER_TABS.ready), done: count(ORDER_TABS.done) },
    ...(history && { page, pageSize: HISTORY_PAGE_SIZE, total: count(ORDER_TABS.done) }),
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
  options: { pickupOnly?: boolean; restore?: boolean; startDispatch?: boolean } = {},
) {
  const vendorId = await myVendorId(userId);
  const order = await prisma.order.findFirst({ where: { id: orderId, vendorId }, select: { checkoutId: true, fulfillment: true } });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  if (options.pickupOnly && order.fulfillment !== "PICKUP") throw new HttpError(400, "Delivery orders are completed by the rider.");

  await prisma.$transaction(async (tx) => {
    // A delivery order starts looking for a rider the moment the store accepts it
    const dispatch = options.startDispatch && order.fulfillment === "DELIVERY" ? { dispatch: "NEW" as const, nextDispatchAt: new Date() } : {};
    await transition(tx, orderId, from, to, { ...extra, ...dispatch }, { vendorId });
    if (options.restore) await restoreStock(tx, orderId);
    await settlePayment(tx, order.checkoutId);
  });
  if (options.restore) await invalidateStore(vendorId);
  await notifyResident(orderId);
  await broadcastOrder(orderId);
}

const acceptSchema = z.object({
  /** How long until it's ready, picked by the store; Feasto's estimate when left out */
  minutes: z.number("Choose how long it will take.").int().min(5, "At least 5 minutes.").max(600, "At most 10 hours.").optional(),
});

/** Accepting says when it will be ready, so the resident sees "Ready by 12:40 PM" right away */
vendorRouter.post("/orders/:id/accept", async (req, res) => {
  const { minutes } = parseBody(acceptSchema, req.body ?? {});
  const id = String(req.params.id);
  const order = await prisma.order.findFirst({
    where: { id, vendor: { ownerId: req.session!.userId } },
    select: { scheduledFor: true, deliveryKm: true, fulfillment: true, items: { select: { quantity: true } }, vendor: { select: { prepMinutes: true, prepPer5Items: true, busyExtraMinutes: true, busyUntil: true } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  const now = new Date();
  const cook = minutes ?? prepEstimate(order.vendor, order.items.reduce((n, i) => n + i.quantity, 0), now);
  let readyBy = new Date(now.getTime() + cook * 60_000);
  // A scheduled order is ready in time for the time asked for, not before it's needed
  if (order.scheduledFor) {
    const ride = order.fulfillment === "DELIVERY" ? rideMinutes(order.deliveryKm == null ? null : Number(order.deliveryKm)) : 0;
    const needed = new Date(order.scheduledFor.getTime() - ride * 60_000);
    if (needed > readyBy) readyBy = needed;
  }
  await vendorStep(req.session!.userId, id, ["PLACED"], "ACCEPTED", { acceptedAt: now, readyBy }, { startDispatch: true });
  res.json({ ok: true, readyBy });
});

const delaySchema = z.object({
  minutes: z.number("Choose how much more time.").int().min(5, "At least 5 minutes.").max(120, "At most 2 hours."),
  reason: z.string("Tell the resident why.").trim().min(3, "Tell the resident why, e.g. Many orders right now.").max(120, "Keep it under 120 letters."),
});

/**
 * The store needs more time: the resident is told the new time and why. After the second delay
 * the resident may cancel for free (orders.ts).
 */
vendorRouter.post("/orders/:id/delay", async (req, res) => {
  const { minutes, reason } = parseBody(delaySchema, req.body);
  const id = String(req.params.id);
  const vendorId = await myVendorId(req.session!.userId);
  const order = await prisma.order.findFirst({ where: { id, vendorId }, select: { readyBy: true, status: true, checkout: { select: { residentId: true } }, vendor: { select: { name: true } } } });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  const from = new Date(Math.max(order.readyBy?.getTime() ?? 0, Date.now()));
  const readyBy = new Date(from.getTime() + minutes * 60_000);
  const { count } = await prisma.order.updateMany({
    where: { id, vendorId, status: { in: ["ACCEPTED", "PREPARING"] } },
    data: { readyBy, delays: { increment: 1 }, delayNote: reason },
  });
  if (count === 0) throw new HttpError(409, "Only an order being prepared can get more time. Refresh to see its status.");
  const delays = (await prisma.order.findUniqueOrThrow({ where: { id }, select: { delays: true } })).delays;
  const time = readyBy.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  await notify(order.checkout.residentId, {
    title: `${order.vendor.name} needs ${minutes} more minutes`,
    body: `${reason}. Now ready by ${time}.${delays >= 2 ? " You can cancel it for free if you'd rather not wait." : ""}`,
    link: `/resident/orders/${id}`,
  });
  await broadcastOrder(id);
  res.json({ ok: true, readyBy, delays });
});

/**
 * An item ran out after the order was placed. What happens is what the resident chose at checkout:
 * take it off (refunded if paid online), or cancel the whole order. "Call me first" needs the store
 * to call, then take it off, so it's the same button after the call.
 */
vendorRouter.post("/orders/:id/items/:itemId/unavailable", async (req, res) => {
  const id = String(req.params.id);
  const itemId = String(req.params.itemId);
  const vendorId = await myVendorId(req.session!.userId);
  const order = await prisma.order.findFirst({
    where: { id, vendorId },
    select: {
      status: true,
      checkoutId: true,
      commissionRate: true,
      checkout: { select: { ifUnavailable: true, residentId: true, paymentMethod: true, paymentStatus: true } },
      items: { select: { id: true, name: true, quantity: true, unitPrice: true, removedAt: true } },
      vendor: { select: { name: true } },
    },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  if (!["PLACED", "ACCEPTED", "PREPARING"].includes(order.status)) throw new HttpError(409, "Items can be taken off only before the order is ready.");
  const item = order.items.find((i) => i.id === itemId);
  if (!item || item.removedAt) throw new HttpError(404, "That item isn't on the order anymore.");
  const left = order.items.filter((i) => !i.removedAt && i.id !== itemId);

  // The resident asked to cancel everything if something is missing, or nothing would be left
  if (order.checkout.ifUnavailable === "CANCEL" || left.length === 0) {
    const reason = left.length === 0 ? `${item.name} ran out, and it was the only item left` : `${item.name} ran out. You asked to cancel the whole order if something is missing`;
    await prisma.$transaction(async (tx) => {
      await transition(tx, id, ["PLACED", "ACCEPTED", "PREPARING"], "CANCELLED", { finishedAt: new Date(), rejectReason: reason }, { vendorId });
      await restoreStock(tx, id);
      await settlePayment(tx, order.checkoutId);
    });
    await invalidateStore(vendorId);
    await notify(order.checkout.residentId, { title: `${order.vendor.name} cancelled ${orderCode(id)}`, body: `${reason}.${order.checkout.paymentMethod === "ONLINE" ? " Your payment is being refunded." : ""}`, link: `/resident/orders/${id}` });
    await broadcastOrder(id);
    return void res.json({ ok: true, cancelled: true });
  }

  const line = Math.round(Number(item.unitPrice) * item.quantity * 100) / 100;
  const subtotal = Math.round(left.reduce((n, i) => n + Number(i.unitPrice) * i.quantity, 0) * 100) / 100;
  const commission = Math.round(subtotal * Number(order.commissionRate)) / 100;
  const paidOnline = order.checkout.paymentMethod === "ONLINE" && order.checkout.paymentStatus === "PAID";
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.orderItem.updateMany({ where: { id: itemId, orderId: id, removedAt: null }, data: { removedAt: new Date() } });
    if (count === 0) throw new HttpError(409, "That item was already taken off.");
    await tx.order.update({ where: { id }, data: { subtotal, commission } });
    await tx.checkout.update({ where: { id: order.checkoutId }, data: { total: { decrement: line } } });
    if (paidOnline) await enqueue(tx, QUEUES.refundRequested, { orderId: id, itemId, amount: line });
  });
  await notify(order.checkout.residentId, {
    title: `${item.name} ran out`,
    body: `${order.vendor.name} took it off ${orderCode(id)}. ${paidOnline ? `₱${line.toFixed(2)} is being refunded.` : `You pay ₱${line.toFixed(2)} less.`} The rest is on its way.`,
    link: `/resident/orders/${id}`,
  });
  await broadcastOrder(id);
  res.json({ ok: true, removed: line, subtotal });
});

// ---------- Timing, distance and the busy kitchen ----------

const timingSchema = z.object({
  prepMinutes: z.number("Enter 5 to 180 minutes.").int("Whole minutes.").min(5, "Enter 5 to 180 minutes.").max(180, "Enter 5 to 180 minutes."),
  prepPer5Items: z.number("Enter 0 to 60 minutes.").int("Whole minutes.").min(0, "Enter 0 to 60 minutes.").max(60, "Enter 0 to 60 minutes."),
  deliveryRadiusKm: z
    .number("Enter 1 to 25 km.")
    .min(1, "Enter 1 to 25 km.")
    .max(25, "Enter 1 to 25 km.")
    .refine((v) => Number.isInteger(Math.round(v * 1e4) / 1e3), "Use at most one decimal place, e.g. 7.5."),
  largeOrderNoticeMinutes: z.number("Enter 0 to 2880 minutes.").int().min(0, "Enter 0 to 2880 minutes.").max(2880, "At most 2 days."),
});

vendorRouter.get("/store/timing", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const [store, actual] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { prepMinutes: true, prepPer5Items: true, deliveryRadiusKm: true, largeOrderNoticeMinutes: true, busyExtraMinutes: true, busyUntil: true } }),
    // What the kitchen really took in the last 30 days, from accepting to "ready"
    prisma.$queryRaw<{ minutes: number | null; orders: bigint; onTime: bigint; timed: bigint }[]>`
      SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("readyAt" - "acceptedAt")) / 60))::int AS minutes,
             count(*) AS orders,
             count(*) FILTER (WHERE "readyBy" IS NOT NULL AND "readyAt" <= "readyBy" + interval '2 minutes') AS "onTime",
             count(*) FILTER (WHERE "readyBy" IS NOT NULL) AS timed
      FROM "Order"
      WHERE "vendorId" = ${vendorId} AND "readyAt" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "scheduledFor" IS NULL
        AND "readyAt" > "acceptedAt" AND "readyAt" - "acceptedAt" < interval '4 hours' AND "createdAt" > now() - interval '30 days'`,
  ]);
  const a = actual[0];
  const settings = await getSettings();
  res.json({
    timing: { ...store, deliveryRadiusKm: Number(store.deliveryRadiusKm), busyNow: busyMinutes(store) },
    actual: { medianMinutes: a?.minutes ?? null, orders: Number(a?.orders ?? 0), onTime: Number(a?.onTime ?? 0), timed: Number(a?.timed ?? 0) },
    largeOrder: { items: settings.largeOrderItems, amount: settings.largeOrderAmount },
  });
});

vendorRouter.put("/store/timing", async (req, res) => {
  const input = parseBody(timingSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  await prisma.vendor.update({ where: { id: vendorId }, data: input });
  await invalidateStore(vendorId);
  res.json({ ok: true });
});

const busySchema = z.object({
  /** 0 turns the busy kitchen off */
  minutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45), z.literal(60)], "Choose 15, 30, 45 or 60 minutes."),
  hours: z.number().int().min(1).max(6).optional().default(2),
});

/** Busy kitchen: every new order takes this much longer, for a while, instead of being declined */
vendorRouter.put("/store/busy", async (req, res) => {
  const { minutes, hours } = parseBody(busySchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const busyUntil = minutes ? new Date(Date.now() + hours * 3600_000) : null;
  await prisma.vendor.update({ where: { id: vendorId }, data: { busyExtraMinutes: minutes, busyUntil } });
  await invalidateStore(vendorId);
  res.json({ ok: true, busyExtraMinutes: minutes, busyUntil });
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
  // An online payment is split now: the store's part goes to it right away
  res.json({ ok: true, payout: (await payoutWords(String(req.params.id))).store });
});

// ---------- Dashboard numbers ----------

const daysQuery = z.object({ days: z.coerce.number().int().min(7).max(90).default(14) });

vendorRouter.get("/sales", async (req, res) => {
  const { days } = daysQuery.parse(req.query);
  const vendorId = await myVendorId(req.session!.userId);
  const [byDay, week] = await Promise.all([dailySales(days, vendorId), weekTrend(vendorId)]);
  res.json({ days: byDay, week });
});

// ---------- Reports: any period the vendor picks, and downloads in the Feasto format ----------

vendorRouter.get("/reports", async (req, res) => {
  const { from, to } = parseBody(periodSchema, req.query);
  const { orders: _orders, ...report } = await storeReport(await myVendorId(req.session!.userId), from, to);
  res.json({ report });
});

/** The Feasto report itself, to view in the browser before downloading */
vendorRouter.get("/reports/document", async (req, res) => {
  const { from, to } = parseBody(periodSchema, req.query);
  const [report, me] = await Promise.all([
    storeReport(await myVendorId(req.session!.userId), from, to),
    prisma.user.findUniqueOrThrow({ where: { id: req.session!.userId }, select: { name: true, email: true } }),
  ]);
  res.json({ document: onScreen(storeDocument(report, `${me.name} (${me.email})`)) });
});

vendorRouter.get("/reports/export", async (req, res) => {
  const { from, to } = parseBody(periodSchema, req.query);
  const format = parseBody(z.object({ format: exportFormat }), req.query).format;
  const [report, me] = await Promise.all([
    storeReport(await myVendorId(req.session!.userId), from, to),
    prisma.user.findUniqueOrThrow({ where: { id: req.session!.userId }, select: { name: true, email: true } }),
  ]);
  await sendReport(res, storeDocument(report, `${me.name} (${me.email})`), format);
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
      where: { vendorId, createdAt: { gte: startOfDay }, status: { notIn: ["AWAITING_PAYMENT", "SCHEDULED", "REJECTED", "CANCELLED"] } },
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
