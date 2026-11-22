import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { BUSY, forgetRiderPosition, jobVisibleTo, OPEN_JOB, riderIsBusy, saveRiderPosition } from "../lib/dispatch.js";
import { bboxQuery, nearQuery, nextOffset, pageQuery } from "../lib/geo.js";
import { HttpError, parseBody } from "../lib/http.js";
import { broadcastOrder, notifyResident, orderCode, settlePayment, transition } from "../lib/orders.js";
import { CHANNELS, notify, publish } from "../lib/liveUpdates.js";
import { hasExpired } from "../lib/renewals.js";
import { marshal } from "../lib/marshalling.js";
import { redis } from "../lib/redis.js";
import { notifyAdmin } from "../lib/activity.js";
import { etaOf } from "../lib/eta.js";
import { rainNow, reportRain } from "../lib/feeAddOns.js";
import { perAccount } from "../lib/rateLimit.js";
import { getSettings } from "../lib/settings.js";
import { averageOf, shortName } from "../lib/riderRatings.js";
import { payoutWords } from "../lib/earnings.js";
import { queueBonusPayout } from "../lib/payouts.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { shareErrandLocation } from "./errands.js";
import { UPLOADED_PHOTO } from "./uploads.js";
import { refuseIfSuspended } from "../lib/userReports.js";
import { endRide, recordPosition } from "../lib/daloy.js";
import { checkRewardsQuietly } from "../lib/loyalty.js";
import { tripJobs, tripProblem } from "../lib/batching.js";

export const riderRouter = Router();
riderRouter.use(requireAuth, requireRole("RIDER"));

const locationKey = (orderId: string) => `rider-location:${orderId}`;

async function riderProfile(userId: string) {
  const profile = await prisma.riderProfile.findUnique({ where: { userId } });
  if (!profile) throw new HttpError(404, "We couldn't find this rider's details.");
  return profile;
}

/** Riders must be approved by an admin before going online or taking jobs. */
async function approvedRider(userId: string) {
  const profile = await riderProfile(userId);
  if (profile.status !== "APPROVED") throw new HttpError(403, "Your rider account isn't approved yet.");
  return profile;
}

/** An expired license means no new work. A delivery already under way can still finish. */
function refuseExpiredLicense(profile: { licenseExpiresAt: Date | null }) {
  if (hasExpired(profile.licenseExpiresAt)) throw new HttpError(403, "Your driver's license has expired. Upload your renewed license to go online.");
}

// ---------- Availability ----------

riderRouter.patch("/availability", async (req, res) => {
  const { isOnline } = parseBody(z.object({ isOnline: z.boolean() }), req.body);
  const profile = await approvedRider(req.session!.userId);
  if (isOnline) {
    refuseExpiredLicense(profile);
    await refuseIfSuspended(req.session!.userId, "jobs");
  }
  await prisma.riderProfile.update({ where: { id: profile.id }, data: { isOnline } });
  if (!isOnline) await forgetRiderPosition(req.session!.userId);
  res.json({ isOnline });
});

const positionSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

/** The phone reports where an online rider is, so jobs reach the riders nearest the store first. */
riderRouter.post("/position", async (req, res) => {
  const { lat, lng } = parseBody(positionSchema, req.body);
  const userId = req.session!.userId;
  const profile = await riderProfile(userId);
  if (profile.status !== "APPROVED" || !profile.isOnline) throw new HttpError(409, "Go online to share your position.");
  await saveRiderPosition(userId, lat, lng);
  res.status(204).end();
});

// ---------- Jobs ----------

const jobsQuery = z.object({
  ...nearQuery,
  /** nearest needs lat/lng; without them the list is "ready first", like the default */
  sort: z.enum(["nearest", "pay", "newest"]).optional(),
  /** Only stores this many kilometres from lat/lng */
  within: z.coerce.number().positive().max(100).optional(),
  bbox: bboxQuery,
  ...pageQuery(10, 100),
});

/**
 * Open jobs, one page at a time. The database does the filtering, sorting and paging, so a
 * rider gets the 10 nearest jobs out of thousands without the API loading the rest.
 */
riderRouter.get("/jobs", async (req, res) => {
  const { lat, lng, sort, within, bbox, limit, offset } = parseBody(jobsQuery, req.query);
  const userId = req.session!.userId;
  const profile = await riderProfile(userId);
  if (profile.status !== "APPROVED" || !profile.isOnline) {
    res.json({ online: false, approved: profile.status === "APPROVED", licenseExpired: hasExpired(profile.licenseExpiresAt), jobs: [], total: 0, nextOffset: null });
    return;
  }

  // Kilometres from the rider to the store. Flat-earth maths is exact to a few metres
  // across a town and, unlike haversine, cheap enough to sort thousands of rows by.
  const here = lat !== undefined && lng !== undefined ? { lat, lng } : null;
  const km = here
    ? Prisma.sql`(111.32 * sqrt(power(v.latitude - ${here.lat}::float8, 2) + power((v.longitude - ${here.lng}::float8) * ${Math.cos((here.lat * Math.PI) / 180)}::float8, 2)))`
    : null;
  const where = Prisma.sql`
    WHERE o.fulfillment = 'DELIVERY' AND o."riderId" IS NULL AND o.status IN (${Prisma.raw(OPEN_JOB.map((s) => `'${s}'`).join(", "))})
    ${
      // The same rule as jobVisibleTo, which the Accept button checks
      profile.vendorId
        ? Prisma.sql`AND o."vendorId" = ${profile.vendorId}`
        : Prisma.sql`AND (o.dispatch = 'EVERYONE' OR EXISTS (SELECT 1 FROM "JobOffer" jo WHERE jo."orderId" = o.id AND jo."riderId" = ${userId}))`
    }
    ${bbox ? Prisma.sql`AND v.longitude BETWEEN ${bbox.west}::float8 AND ${bbox.east}::float8 AND v.latitude BETWEEN ${bbox.south}::float8 AND ${bbox.north}::float8` : Prisma.empty}
    ${km && within ? Prisma.sql`AND ${km} <= ${within}::float8` : Prisma.empty}`;
  const orderBy =
    sort === "nearest" && km
      ? Prisma.sql`${km} ASC NULLS LAST, o."createdAt" ASC`
      : sort === "pay"
        ? Prisma.sql`o."deliveryFee" DESC, o."createdAt" ASC`
        : sort === "newest"
          ? Prisma.sql`o."createdAt" DESC`
          : // Food that's ready waits the longest, so it comes first
            Prisma.sql`o."readyAt" ASC NULLS LAST, o."createdAt" ASC`;

  const [page, [{ count }]] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT o.id FROM "Order" o JOIN "Vendor" v ON v.id = o."vendorId" ${where}
      ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "Order" o JOIN "Vendor" v ON v.id = o."vendorId" ${where}`,
  ]);
  const ids = page.map((row) => row.id);
  const rows = await prisma.order.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      status: true,
      deliveryFee: true,
      riderCut: true,
      createdAt: true,
      scheduledFor: true,
      subtotal: true, storeDiscount: true, feastoDiscount: true,
      vendor: { select: { name: true, address: true, latitude: true, longitude: true, imageUrl: true } },
      items: { select: { name: true, quantity: true, unitPrice: true } },
      checkout: { select: { deliveryAddress: true, deliveryLat: true, deliveryLng: true, paymentMethod: true, onlineMethod: true, paymentStatus: true } },
    },
  });
  // findMany doesn't keep the order of `in`, so put the rows back in the page's order
  const byId = new Map(rows.map((row) => [row.id, row]));
  const jobs = ids.flatMap((id) => byId.get(id) ?? []);
  const total = Number(count);
  res.json({ online: true, approved: true, jobs, total, nextOffset: nextOffset(offset, jobs.length, total) });
});

riderRouter.post("/jobs/:id/accept", async (req, res) => {
  const userId = req.session!.userId;
  const orderId = String(req.params.id);
  const profile = await approvedRider(userId);
  if (!profile.isOnline) throw new HttpError(400, "Go online to accept jobs.");
  refuseExpiredLicense(profile);
  await refuseIfSuspended(userId, "jobs");

  // A short Redis lock per rider: two quick taps on two different jobs can't both pass
  // the "one delivery at a time" check below. SET NX is atomic across all API copies.
  const lock = `lock:rider:${userId}`;
  if ((await redis.set(lock, "1", "EX", 10, "NX")) !== "OK") throw new HttpError(429, "Hold on, still accepting your last job.");
  try {
    // One delivery at a time, unless this one fits on the same trip (lib/batching.ts)
    if (await riderIsBusy(userId)) {
      const problem = await tripProblem(userId, orderId);
      if (problem) throw new HttpError(409, problem);
    }

    // The claim itself: only succeeds if nobody has taken the job yet. When several riders
    // tap at once, the database lets exactly one UPDATE through.
    const { count } = await prisma.order.updateMany({
      where: { id: orderId, riderId: null, fulfillment: "DELIVERY", status: { in: OPEN_JOB }, ...jobVisibleTo(profile) },
      data: { riderId: userId, nextDispatchAt: null },
    });
    if (count === 0) {
      const job = await prisma.order.findUnique({ where: { id: orderId }, select: { riderId: true, status: true } });
      if (job && !job.riderId && OPEN_JOB.includes(job.status)) throw new HttpError(403, "This job hasn't reached you yet.");
      throw new HttpError(409, "Another rider already took this job.");
    }
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

/** Open jobs the rider could add to the delivery they're on (two orders, one trip) */
riderRouter.get("/jobs/along", async (req, res) => {
  const userId = req.session!.userId;
  const profile = await approvedRider(userId);
  if (!profile.isOnline) return void res.json({ base: null, jobs: [] });
  res.json(await tripJobs(userId, profile));
});

riderRouter.get("/active", async (req, res) => {
  const userId = req.session!.userId;
  // Two orders on one trip: ?id= picks which one the page shows; the trip lists both
  const trip = await prisma.order.findMany({
    where: { riderId: userId, status: { in: BUSY } },
    orderBy: { acceptedAt: "asc" },
    select: { id: true, status: true, vendor: { select: { name: true } }, checkout: { select: { deliveryAddress: true } } },
  });
  const wanted = typeof req.query.id === "string" && trip.some((t) => t.id === req.query.id) ? req.query.id : trip[0]?.id;
  const order = await prisma.order.findFirst({
    where: { id: wanted ?? "-", riderId: userId, status: { in: BUSY } },
    include: {
      vendor: { select: { name: true, address: true, latitude: true, longitude: true, imageUrl: true, owner: { select: { phone: true } } } },
      items: { select: { id: true, name: true, quantity: true, unitPrice: true, removedAt: true } },
      checkout: {
        select: {
          deliveryAddress: true,
          deliveryLat: true,
          deliveryLng: true,
          notes: true,
          paymentMethod: true,
          onlineMethod: true,
          paymentStatus: true,
          resident: { select: { name: true, phone: true } },
        },
      },
    },
  });
  // How long to wait at the door before "Not received" opens
  res.json({
    order: order && { ...order, eta: etaOf(order) },
    trip: trip.length > 1 ? trip.map((t) => ({ id: t.id, code: orderCode(t.id), status: t.status, store: t.vendor.name, address: t.checkout.deliveryAddress })) : [],
    doorWaitMinutes: (await getSettings()).doorWaitMinutes,
  });
});

/** The rider is at the door: the resident is told, and the wait before "Not received" starts */
riderRouter.post("/active/:id/arrived", async (req, res) => {
  const id = String(req.params.id);
  const order = await prisma.order.findFirst({ where: { id, riderId: req.session!.userId, status: "PICKED_UP" }, select: { arrivedAt: true, checkout: { select: { residentId: true } } } });
  if (!order) throw new HttpError(409, "Only an order you picked up can be at the door. Refresh to see its status.");
  const arrivedAt = order.arrivedAt ?? new Date();
  // At the door: the ride is over, the wait isn't traffic
  await endRide(id);
  if (!order.arrivedAt) {
    await prisma.order.updateMany({ where: { id, arrivedAt: null }, data: { arrivedAt } });
    await notify(order.checkout.residentId, { title: "Your rider is at your door", body: `${req.session!.name.split(" ")[0]} is outside with ${orderCode(id)}. Please come out to get it.`, link: `/resident/orders/${id}` });
    await broadcastOrder(id);
  }
  res.json({ ok: true, arrivedAt });
});

const notReceivedSchema = z.object({
  photoUrl: z.string().regex(UPLOADED_PHOTO, "Take a photo at the door first, to show you were there."),
});

/**
 * Nobody came to the door after the wait (with calls and chat): the order ends as not received,
 * the resident gets a strike (enough of them and they can only pay online), and nothing is refunded
 * automatically: the admin sees it and decides.
 */
riderRouter.post("/active/:id/not-received", async (req, res) => {
  const id = String(req.params.id);
  const { photoUrl } = parseBody(notReceivedSchema, req.body);
  const riderId = req.session!.userId;
  const [order, settings] = await Promise.all([
    prisma.order.findFirst({
      where: { id, riderId, status: "PICKED_UP" },
      select: { arrivedAt: true, checkoutId: true, checkout: { select: { residentId: true, paymentMethod: true } }, vendor: { select: { name: true, ownerId: true } } },
    }),
    getSettings(),
  ]);
  if (!order) throw new HttpError(409, "Only an order you picked up can be marked not received. Refresh to see its status.");
  if (!order.arrivedAt) throw new HttpError(400, "Tap \"I'm at the door\" first, then call and chat with the customer.");
  const opens = order.arrivedAt.getTime() + settings.doorWaitMinutes * 60_000;
  if (Date.now() < opens) {
    const left = Math.ceil((opens - Date.now()) / 60_000);
    throw new HttpError(400, `Wait ${left} more minute${left === 1 ? "" : "s"} at the door, and call or chat with the customer meanwhile.`);
  }
  const online = order.checkout.paymentMethod === "ONLINE";
  await prisma.$transaction(async (tx) => {
    await transition(
      tx,
      id,
      ["PICKED_UP"],
      "CANCELLED",
      {
        finishedAt: new Date(),
        noShow: true,
        deliveryPhotoUrl: photoUrl,
        rejectReason: "Not received: nobody came to the door",
        // Paid online: not refunded by itself, the admin decides
        ...(online && { refundedAt: new Date(), refundNote: "Not refunded: nobody came to the door to receive it. The admin can refund it by hand if that was wrong." }),
      },
      { riderId },
    );
    await tx.user.update({ where: { id: order.checkout.residentId }, data: { noShows: { increment: 1 } } });
    await settlePayment(tx, order.checkoutId);
  });
  await redis.del(locationKey(id));
  await endRide(id, { forget: true });
  const strikes = (await prisma.user.findUniqueOrThrow({ where: { id: order.checkout.residentId }, select: { noShows: true } })).noShows;
  await notify(order.checkout.residentId, {
    title: `${orderCode(id)} wasn't received`,
    body: `Your rider waited ${settings.doorWaitMinutes} minutes at your door and tried to reach you.${strikes >= settings.noShowStrikes ? " Cash on delivery is now off for your account: pay online for your next orders." : ""}`,
    link: `/resident/orders/${id}`,
  });
  await notify(order.vendor.ownerId, { title: `${orderCode(id)} wasn't received`, body: "Nobody came to the door. The rider's photo is on the order.", link: "/vendor/orders?tab=done" });
  await notifyAdmin({ title: `${orderCode(id)} wasn't received`, body: `From ${order.vendor.name}. The resident has ${strikes} order${strikes === 1 ? "" : "s"} not received.${online ? " It was paid online and not refunded." : ""}`, link: "/admin/orders" });
  await broadcastOrder(id);
  res.json({ ok: true });
});

riderRouter.post("/active/:id/picked-up", async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction((tx) => transition(tx, id, ["READY"], "PICKED_UP", { pickedUpAt: new Date() }, { riderId: req.session!.userId }));
  await endRide(id);
  await notifyResident(id);
  await broadcastOrder(id);
  res.json({ ok: true });
});

const deliveredSchema = z.object({
  photoUrl: z.string().regex(UPLOADED_PHOTO, "Take a photo of the handed-over order first."),
});

/** Finishing a delivery needs a proof-of-delivery photo, which the resident and the store can see. */
riderRouter.post("/active/:id/delivered", async (req, res) => {
  const id = String(req.params.id);
  const { photoUrl } = parseBody(deliveredSchema, req.body);
  const order = await prisma.order.findFirst({ where: { id, riderId: req.session!.userId }, select: { checkoutId: true, vendor: { select: { ownerId: true } }, checkout: { select: { residentId: true } } } });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  // Daloy: the ride to the door ends here (if "at the door" wasn't tapped), so a delay bonus is on the order before the payout
  await endRide(id);
  await prisma.$transaction(async (tx) => {
    await transition(tx, id, ["PICKED_UP"], "DELIVERED", { finishedAt: new Date(), deliveryPhotoUrl: photoUrl }, { riderId: req.session!.userId });
    await settlePayment(tx, order.checkoutId); // cash collected by the rider
    await queueBonusPayout(tx, id);
  });
  await redis.del(locationKey(id));
  await endRide(id, { forget: true });
  await notifyResident(id);
  // Suki: points, missions and an inviter's reward can be due now
  void checkRewardsQuietly(order.checkout.residentId);
  // Online payments are split now: the store's and the rider's parts go to them right away
  const payout = await payoutWords(id);
  await notify(order.vendor.ownerId, { title: `${orderCode(id)} was delivered`, body: `The rider handed it over. ${payout.store}`, link: "/vendor/orders?tab=done" });
  await broadcastOrder(id);
  res.json({ ok: true, payout: payout.rider });
});

// ---------- Live location ----------

const locationSchema = z.object({
  orderId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** From the "simulate the ride" demo, not the phone's GPS: Daloy keeps it apart from real rides */
  demo: z.boolean().optional(),
});

/**
 * The rider's phone sends its position every few seconds from accepting a job until it's
 * delivered, so the customer sees them head to the store and then to their door.
 * It's kept only in Redis (it changes constantly and needn't be stored forever)
 * and pushed to the resident's open order page through Redis pub/sub.
 */
riderRouter.post("/location", async (req, res) => {
  const { orderId, lat, lng, demo = false } = parseBody(locationSchema, req.body);
  const riderId = req.session!.userId;
  const order = await prisma.order.findFirst({
    where: { id: orderId, riderId, status: { in: BUSY } },
    select: {
      status: true,
      deliveryKm: true,
      checkout: { select: { residentId: true, deliveryLat: true, deliveryLng: true } },
      vendor: { select: { ownerId: true, latitude: true, longitude: true } },
    },
  });
  if (!order) {
    // Not a delivery: a Pabili this rider is running
    if (await shareErrandLocation(riderId, orderId, lat, lng, demo)) return void res.status(204).end();
    throw new HttpError(409, "Location is only shared while you have a delivery.");
  }
  // Daloy: how fast the ride really goes, to the store and then to the door
  const toDoor = order.status === "PICKED_UP";
  const pin = (a: number | null, b: number | null) => (a != null && b != null ? { lat: a, lng: b } : null);
  await Promise.all([
    recordPosition(
      {
        id: orderId,
        kind: "ORDER",
        leg: toDoor ? "TO_DOOR" : "TO_STORE",
        riderId,
        destination: toDoor ? pin(order.checkout.deliveryLat, order.checkout.deliveryLng) : pin(order.vendor.latitude, order.vendor.longitude),
        pricedKm: order.deliveryKm == null ? null : Number(order.deliveryKm),
      },
      { lat, lng },
      demo,
    ),
    // The admin's live map shows riders on a job too
    saveRiderPosition(riderId, lat, lng),
  ]);
  const at = new Date().toISOString();
  await redis.set(locationKey(orderId), marshal({ lat, lng, at }, { transport: "redis", channel: locationKey(orderId), kind: "rider location" }), "EX", 3600);
  // The customer follows the rider to their door; the store sees them coming for the pickup
  const event = { type: "rider.location", orderId, lat, lng, at } as const;
  await Promise.all([publish(CHANNELS.user(order.checkout.residentId), event), publish(CHANNELS.user(order.vendor.ownerId), event)]);
  // Two orders on one trip: the other customer and store follow the same rider
  const others = await prisma.order.findMany({ where: { riderId, status: { in: BUSY }, id: { not: orderId } }, select: { id: true, checkout: { select: { residentId: true } }, vendor: { select: { ownerId: true } } } });
  for (const o of others) {
    await redis.set(locationKey(o.id), marshal({ lat, lng, at }, { transport: "redis", channel: locationKey(o.id), kind: "rider location" }), "EX", 3600);
    const e = { type: "rider.location", orderId: o.id, lat, lng, at } as const;
    await Promise.all([publish(CHANNELS.user(o.checkout.residentId), e), publish(CHANNELS.user(o.vendor.ownerId), e)]);
  }
  res.status(204).end();
});

// ---------- History and earnings ----------

riderRouter.get("/history", async (req, res) => {
  const userId = req.session!.userId;
  const delivered = { riderId: userId, status: "DELIVERED" } as const;
  const [deliveries, all, today, profile] = await Promise.all([
    prisma.order.findMany({
      where: delivered,
      orderBy: { finishedAt: "desc" },
      take: 50,
      select: {
        id: true,
        finishedAt: true,
        deliveryFee: true,
        riderCut: true,
        riderBonus: true,
        riderBonusNote: true,
        tip: true,
        subtotal: true, storeDiscount: true, feastoDiscount: true,
        vendor: { select: { name: true, imageUrl: true } },
        items: { select: { quantity: true } },
        checkout: { select: { deliveryAddress: true, paymentMethod: true } },
        riderRating: { select: { rating: true } },
      },
    }),
    prisma.order.aggregate({ where: delivered, _sum: { deliveryFee: true, riderCut: true, tip: true, riderBonus: true }, _count: true }),
    prisma.order.aggregate({ where: { ...delivered, finishedAt: { gte: manilaStartOfDay() } }, _sum: { deliveryFee: true, riderCut: true, tip: true, riderBonus: true }, _count: true }),
    prisma.riderProfile.findUnique({ where: { userId }, select: { ratingSum: true, ratingCount: true } }),
  ]);
  // Earnings are the delivery fees after Feasto's share, plus every tip and delay bonus, which all go to the rider
  const earned = (sum: { deliveryFee: Prisma.Decimal | null; riderCut: Prisma.Decimal | null; tip: Prisma.Decimal | null; riderBonus: Prisma.Decimal | null }) =>
    Math.round((Number(sum.deliveryFee ?? 0) - Number(sum.riderCut ?? 0) + Number(sum.tip ?? 0) + Number(sum.riderBonus ?? 0)) * 100) / 100;
  res.json({
    deliveries,
    today: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
    totals: {
      today: { count: today._count, earnings: earned(today._sum), tips: Number(today._sum.tip ?? 0), bonuses: Number(today._sum.riderBonus ?? 0), feastoShare: Number(today._sum.riderCut ?? 0) },
      allTime: { count: all._count, earnings: earned(all._sum), tips: Number(all._sum.tip ?? 0), bonuses: Number(all._sum.riderBonus ?? 0), feastoShare: Number(all._sum.riderCut ?? 0) },
    },
    rating: { average: averageOf(profile?.ratingSum ?? 0, profile?.ratingCount ?? 0), count: profile?.ratingCount ?? 0 },
  });
});

/** What residents said: the average, how many of each star, the most-tapped praise, and the latest ratings. */
riderRouter.get("/ratings", async (req, res) => {
  const riderId = req.session!.userId;
  const [profile, stars, tags, latest, tips] = await Promise.all([
    prisma.riderProfile.findUnique({ where: { userId: riderId }, select: { ratingSum: true, ratingCount: true } }),
    prisma.riderRating.groupBy({ by: ["rating"], where: { riderId }, _count: { _all: true } }),
    prisma.$queryRaw<{ tag: string; count: bigint }[]>`
      SELECT tag, count(*) AS count FROM "RiderRating", unnest(tags) AS tag
      WHERE "riderId" = ${riderId} GROUP BY tag ORDER BY count DESC, tag`,
    prisma.riderRating.findMany({
      where: { riderId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        rating: true,
        tags: true,
        comment: true,
        createdAt: true,
        resident: { select: { name: true } },
        order: { select: { id: true, tip: true, vendor: { select: { name: true } } } },
      },
    }),
    prisma.order.aggregate({ where: { riderId, status: "DELIVERED", tip: { gt: 0 } }, _sum: { tip: true }, _count: true }),
  ]);
  const count = profile?.ratingCount ?? 0;
  res.json({
    average: averageOf(profile?.ratingSum ?? 0, count),
    count,
    stars: [5, 4, 3, 2, 1].map((n) => ({ stars: n, count: stars.find((s) => s.rating === n)?._count._all ?? 0 })),
    tags: tags.map((t) => ({ tag: t.tag, count: Number(t.count) })),
    tips: { total: Number(tips._sum.tip ?? 0), count: tips._count },
    ratings: latest.map(({ resident, order, ...rating }) => ({
      ...rating,
      author: shortName(resident.name),
      orderId: order.id,
      storeName: order.vendor.name,
      tip: Number(order.tip),
    })),
  });
});

/** "It's raining here": two riders within half an hour turn on the rain add-on, which is all theirs */
riderRouter.get("/rain", async (req, res) => {
  const rain = await rainNow();
  const reported = (await redis.zscore("weather:rain-reports", req.session!.userId).catch(() => null)) !== null;
  res.json({ rain, reported, fee: (await getSettings()).rainFee });
});

riderRouter.post("/rain", perAccount("rain", 4, 1800, "You already said it's raining. It counts for half an hour."), async (req, res) => {
  const rain = await reportRain(req.session!.userId);
  res.json({ rain, reported: true, fee: (await getSettings()).rainFee });
});
