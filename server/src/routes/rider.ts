import { Router } from "express";
import { z } from "zod";
import type { OrderStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { broadcastOrder, notifyResident, orderCode, settlePayment, transition } from "../lib/orders.js";
import { CHANNELS, notify, publish } from "../lib/realtime.js";
import { redis } from "../lib/redis.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const riderRouter = Router();
riderRouter.use(requireAuth, requireRole("RIDER"));

/** Statuses where a delivery order can be taken by a rider (store accepted it, nobody took it yet). */
const OPEN_JOB: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY"];
/** Statuses where a rider is busy with an order. */
const BUSY: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"];

const locationKey = (orderId: string) => `rider-location:${orderId}`;

async function riderProfile(userId: string) {
  const profile = await prisma.riderProfile.findUnique({ where: { userId } });
  if (!profile) throw new HttpError(404, "Rider profile not found.");
  return profile;
}

/** Riders must be approved by an admin before going online or taking jobs. */
async function approvedRider(userId: string) {
  const profile = await riderProfile(userId);
  if (profile.status !== "APPROVED") throw new HttpError(403, "Your rider account isn't approved yet.");
  return profile;
}

// ---------- Availability ----------

riderRouter.patch("/availability", async (req, res) => {
  const { isOnline } = parseBody(z.object({ isOnline: z.boolean() }), req.body);
  const profile = await approvedRider(req.session!.userId);
  await prisma.riderProfile.update({ where: { id: profile.id }, data: { isOnline } });
  res.json({ isOnline });
});

// ---------- Jobs ----------

riderRouter.get("/jobs", async (req, res) => {
  const profile = await riderProfile(req.session!.userId);
  if (profile.status !== "APPROVED" || !profile.isOnline) {
    res.json({ online: false, approved: profile.status === "APPROVED", jobs: [] });
    return;
  }
  const jobs = await prisma.order.findMany({
    where: { fulfillment: "DELIVERY", riderId: null, status: { in: OPEN_JOB } },
    orderBy: [{ readyAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 30,
    select: {
      id: true,
      status: true,
      deliveryFee: true,
      createdAt: true,
      vendor: { select: { name: true, address: true } },
      items: { select: { quantity: true } },
      checkout: { select: { deliveryAddress: true } },
    },
  });
  res.json({ online: true, approved: true, jobs });
});

riderRouter.post("/jobs/:id/accept", async (req, res) => {
  const userId = req.session!.userId;
  const orderId = String(req.params.id);
  const profile = await approvedRider(userId);
  if (!profile.isOnline) throw new HttpError(400, "Go online to accept jobs.");

  // A short Redis lock per rider: two quick taps on two different jobs can't both pass
  // the "one delivery at a time" check below. SET NX is atomic across all API copies.
  const lock = `lock:rider:${userId}`;
  if ((await redis.set(lock, "1", "EX", 10, "NX")) !== "OK") throw new HttpError(429, "Hold on, still accepting your last job.");
  try {
    const busy = await prisma.order.count({ where: { riderId: userId, status: { in: BUSY } } });
    if (busy > 0) throw new HttpError(409, "Finish your current delivery first.");

    // The claim itself: only succeeds if nobody has taken the job yet. When several riders
    // tap at once, the database lets exactly one UPDATE through.
    const { count } = await prisma.order.updateMany({
      where: { id: orderId, riderId: null, fulfillment: "DELIVERY", status: { in: OPEN_JOB } },
      data: { riderId: userId },
    });
    if (count === 0) throw new HttpError(409, "Another rider already took this job.");
  } finally {
    await redis.del(lock);
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { vendor: { select: { ownerId: true } }, checkout: { select: { residentId: true } } },
  });
  const riderName = (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } })).name;
  await notify(order.vendor.ownerId, { title: `${riderName} is picking up ${orderCode(orderId)}`, body: "Hand it over when it's ready.", link: "/vendor/orders?tab=ready" });
  await notify(order.checkout.residentId, { title: "A rider is assigned", body: `${riderName} will deliver your order.`, link: `/resident/orders/${orderId}` });
  await broadcastOrder(orderId);
  res.json({ ok: true });
});

// ---------- The rider's current delivery ----------

riderRouter.get("/active", async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { riderId: req.session!.userId, status: { in: BUSY } },
    include: {
      vendor: { select: { name: true, address: true, owner: { select: { phone: true } } } },
      items: { select: { id: true, name: true, quantity: true } },
      checkout: { select: { deliveryAddress: true, notes: true, paymentMethod: true, paymentStatus: true, resident: { select: { name: true, phone: true } } } },
    },
  });
  res.json({ order });
});

riderRouter.post("/active/:id/picked-up", async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction((tx) => transition(tx, id, ["READY"], "PICKED_UP", { pickedUpAt: new Date() }, { riderId: req.session!.userId }));
  await notifyResident(id);
  await broadcastOrder(id);
  res.json({ ok: true });
});

riderRouter.post("/active/:id/delivered", async (req, res) => {
  const id = String(req.params.id);
  const order = await prisma.order.findFirst({ where: { id, riderId: req.session!.userId }, select: { checkoutId: true, vendor: { select: { ownerId: true } } } });
  if (!order) throw new HttpError(404, "Order not found.");
  await prisma.$transaction(async (tx) => {
    await transition(tx, id, ["PICKED_UP"], "DELIVERED", { finishedAt: new Date() }, { riderId: req.session!.userId });
    await settlePayment(tx, order.checkoutId); // cash collected by the rider
  });
  await redis.del(locationKey(id));
  await notifyResident(id);
  await notify(order.vendor.ownerId, { title: `${orderCode(id)} was delivered`, body: "The rider handed it to the resident.", link: "/vendor/orders?tab=done" });
  await broadcastOrder(id);
  res.json({ ok: true });
});

// ---------- Live location ----------

const locationSchema = z.object({
  orderId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * The rider's phone sends its position every few seconds while delivering.
 * It's kept only in Redis (it changes constantly and needn't be stored forever)
 * and pushed to the resident's open order page through Redis pub/sub.
 */
riderRouter.post("/location", async (req, res) => {
  const { orderId, lat, lng } = parseBody(locationSchema, req.body);
  const order = await prisma.order.findFirst({
    where: { id: orderId, riderId: req.session!.userId, status: "PICKED_UP" },
    select: { checkout: { select: { residentId: true } } },
  });
  if (!order) throw new HttpError(409, "Location is only shared while delivering.");
  const at = new Date().toISOString();
  await redis.set(locationKey(orderId), JSON.stringify({ lat, lng, at }), "EX", 3600);
  await publish(CHANNELS.user(order.checkout.residentId), { type: "rider.location", orderId, lat, lng, at });
  res.status(204).end();
});

// ---------- History and earnings ----------

riderRouter.get("/history", async (req, res) => {
  const userId = req.session!.userId;
  const deliveries = await prisma.order.findMany({
    where: { riderId: userId, status: "DELIVERED" },
    orderBy: { finishedAt: "desc" },
    take: 50,
    select: { id: true, finishedAt: true, deliveryFee: true, vendor: { select: { name: true } }, checkout: { select: { deliveryAddress: true } } },
  });
  const [all, today] = await Promise.all([
    prisma.order.aggregate({ where: { riderId: userId, status: "DELIVERED" }, _sum: { deliveryFee: true }, _count: true }),
    prisma.order.aggregate({ where: { riderId: userId, status: "DELIVERED", finishedAt: { gte: manilaStartOfDay() } }, _sum: { deliveryFee: true }, _count: true }),
  ]);
  res.json({
    deliveries,
    today: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
    totals: {
      today: { count: today._count, earnings: Number(today._sum.deliveryFee ?? 0) },
      allTime: { count: all._count, earnings: Number(all._sum.deliveryFee ?? 0) },
    },
  });
});
