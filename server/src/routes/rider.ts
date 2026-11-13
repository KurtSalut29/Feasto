import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { BUSY, forgetRiderPosition, jobVisibleTo, OPEN_JOB, saveRiderPosition } from "../lib/dispatch.js";
import { bboxQuery, nearQuery, nextOffset, pageQuery } from "../lib/geo.js";
import { HttpError, parseBody } from "../lib/http.js";
import { broadcastOrder, notifyResident, orderCode, settlePayment, transition } from "../lib/orders.js";
import { CHANNELS, notify, publish } from "../lib/liveUpdates.js";
import { hasExpired } from "../lib/renewals.js";
import { marshal } from "../lib/marshalling.js";
import { redis } from "../lib/redis.js";
import { averageOf, shortName } from "../lib/riderRatings.js";
import { payoutWords } from "../lib/earnings.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { UPLOADED_PHOTO } from "./uploads.js";

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
  if (isOnline) refuseExpiredLicense(profile);
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
      subtotal: true,
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

riderRouter.get("/active", async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { riderId: req.session!.userId, status: { in: BUSY } },
    include: {
      vendor: { select: { name: true, address: true, latitude: true, longitude: true, imageUrl: true, owner: { select: { phone: true } } } },
      items: { select: { id: true, name: true, quantity: true, unitPrice: true } },
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
  res.json({ order });
});

riderRouter.post("/active/:id/picked-up", async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction((tx) => transition(tx, id, ["READY"], "PICKED_UP", { pickedUpAt: new Date() }, { riderId: req.session!.userId }));
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
  const order = await prisma.order.findFirst({ where: { id, riderId: req.session!.userId }, select: { checkoutId: true, vendor: { select: { ownerId: true } } } });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  await prisma.$transaction(async (tx) => {
    await transition(tx, id, ["PICKED_UP"], "DELIVERED", { finishedAt: new Date(), deliveryPhotoUrl: photoUrl }, { riderId: req.session!.userId });
    await settlePayment(tx, order.checkoutId); // cash collected by the rider
  });
  await redis.del(locationKey(id));
  await notifyResident(id);
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
});

/**
 * The rider's phone sends its position every few seconds from accepting a job until it's
 * delivered, so the customer sees them head to the store and then to their door.
 * It's kept only in Redis (it changes constantly and needn't be stored forever)
 * and pushed to the resident's open order page through Redis pub/sub.
 */
riderRouter.post("/location", async (req, res) => {
  const { orderId, lat, lng } = parseBody(locationSchema, req.body);
  const order = await prisma.order.findFirst({
    where: { id: orderId, riderId: req.session!.userId, status: { in: BUSY } },
    select: { checkout: { select: { residentId: true } }, vendor: { select: { ownerId: true } } },
  });
  if (!order) throw new HttpError(409, "Location is only shared while you have a delivery.");
  const at = new Date().toISOString();
  await redis.set(locationKey(orderId), marshal({ lat, lng, at }, { transport: "redis", channel: locationKey(orderId), kind: "rider location" }), "EX", 3600);
  // The customer follows the rider to their door; the store sees them coming for the pickup
  const event = { type: "rider.location", orderId, lat, lng, at } as const;
  await Promise.all([publish(CHANNELS.user(order.checkout.residentId), event), publish(CHANNELS.user(order.vendor.ownerId), event)]);
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
        tip: true,
        subtotal: true,
        vendor: { select: { name: true, imageUrl: true } },
        items: { select: { quantity: true } },
        checkout: { select: { deliveryAddress: true, paymentMethod: true } },
        riderRating: { select: { rating: true } },
      },
    }),
    prisma.order.aggregate({ where: delivered, _sum: { deliveryFee: true, riderCut: true, tip: true }, _count: true }),
    prisma.order.aggregate({ where: { ...delivered, finishedAt: { gte: manilaStartOfDay() } }, _sum: { deliveryFee: true, riderCut: true, tip: true }, _count: true }),
    prisma.riderProfile.findUnique({ where: { userId }, select: { ratingSum: true, ratingCount: true } }),
  ]);
  // Earnings are the delivery fees after Feasto's share, plus every tip, which all go to the rider
  const earned = (sum: { deliveryFee: Prisma.Decimal | null; riderCut: Prisma.Decimal | null; tip: Prisma.Decimal | null }) =>
    Math.round((Number(sum.deliveryFee ?? 0) - Number(sum.riderCut ?? 0) + Number(sum.tip ?? 0)) * 100) / 100;
  res.json({
    deliveries,
    today: new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
    totals: {
      today: { count: today._count, earnings: earned(today._sum), tips: Number(today._sum.tip ?? 0), feastoShare: Number(today._sum.riderCut ?? 0) },
      allTime: { count: all._count, earnings: earned(all._sum), tips: Number(all._sum.tip ?? 0), feastoShare: Number(all._sum.riderCut ?? 0) },
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
