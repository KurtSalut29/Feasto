import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { priceDelivery, quoteDelivery } from "../lib/deliveryFee.js";
import { PREFERRED_RIDER_SECONDS, riderIsBusy, riderDistances } from "../lib/dispatch.js";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { broadcastErrand, chosenRider, ERRAND_WAIT_MINUTES, PABILI_BUDGET_MIN, PABILI_MAX_KM, ridersToChoose, tellNearbyRiders } from "../lib/errands.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { CHANNELS, notify, publish } from "../lib/liveUpdates.js";
import { marshal } from "../lib/marshalling.js";
import { perAccount } from "../lib/rateLimit.js";
import { redis } from "../lib/redis.js";
import { hasExpired } from "../lib/renewals.js";
import { averageOf, shortName } from "../lib/riderRatings.js";
import { getSettings } from "../lib/settings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { UPLOADED_PHOTO } from "./uploads.js";
import { refuseWithoutId } from "../lib/identity.js";
import { refuseIfSuspended } from "../lib/userReports.js";

const peso = (n: unknown) => Math.round(Number(n) * 100) / 100;
const locationKey = (id: string) => `rider-location:${id}`;
const spot = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

// ---------- The riders a resident can ask for (checkout and Pabili) ----------

export const availableRidersRouter = Router();
availableRidersRouter.use(requireAuth, requireRole("RESIDENT"));

/** Free riders who could take a job now, nearest to the spot (the store, or the Pabili shop) first */
availableRidersRouter.get("/available", async (req, res) => {
  const at = spot.parse(req.query);
  res.json({ riders: await ridersToChoose(at, req.session!.userId), waitSeconds: PREFERRED_RIDER_SECONDS });
});

// ---------- Residents: asking for a Pabili ----------

export const errandsRouter = Router();
errandsRouter.use(requireAuth, requireRole("RESIDENT"));

const itemSchema = z.object({
  name: z.string().trim().min(2, "Write what to buy.").max(80),
  quantity: z.number().int().min(1, "At least 1.").max(50, "50 at most."),
  note: z.string().trim().max(120).optional().transform((v) => v || null),
});

const errandSchema = z.object({
  /** The shop, by name and where it is, the way you'd tell a friend: no map pin (the rider's phone sets its spot when they buy) */
  shopName: z.string().trim().min(2, "Enter the shop's name.").max(80),
  shopAddress: z.string().trim().min(3, "Say where the shop is, like the street or a landmark.").max(200),
  items: z.array(itemSchema).min(1, "Add at least one thing to buy.").max(20, "20 things at most in one Pabili."),
  notes: z.string().trim().max(200).optional().transform((v) => v || null),
  /** The most is the admin's setting, checked by withinBudgetLimit */
  budget: z.number("Enter how much the rider may spend.").min(PABILI_BUDGET_MIN, `Enter at least ₱${PABILI_BUDGET_MIN}.`),
  addressId: z.string().min(1, "Choose where to deliver it."),
  /** Ask a particular rider first; without it, the free riders nearest the shop hear about it */
  preferredRiderId: z.string().min(1).optional(),
  /** The lowest fee the resident saw; if it changed in the meantime, they're asked to look again */
  expectedFee: z.number().optional(),
});

const budgetMax = async () => (await getSettings()).pabiliBudgetMax;

/** The rider pays at the shop with their own money, so a Pabili stays within what the admin set */
async function withinBudgetLimit(budget: number) {
  const max = await budgetMax();
  if (budget > max) {
    const most = `₱${max.toLocaleString("en-PH")}`;
    throw new ValidationError({
      budget: [`${most} is the most for one Pabili, because the rider pays at the shop with their own money. Lower the budget, or split your list into two Pabili.`],
    });
  }
}

async function addressOf(userId: string, addressId: string) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new ValidationError({ addressId: ["Choose one of your saved addresses."] });
  return address;
}

const feeFor = async (shop: { lat: number; lng: number }, address: { latitude: number | null; longitude: number | null }) =>
  quoteDelivery({ latitude: shop.lat, longitude: shop.lng }, address, await getSettings());

/**
 * The fee before anyone knows where the shop is: from the lowest (a shop close to the customer)
 * to a shop PABILI_MAX_KM away. The rider's phone sets the real one when they buy.
 */
async function feeRange() {
  const settings = await getSettings();
  return { min: priceDelivery(null, settings).fee, max: priceDelivery(PABILI_MAX_KM, settings).fee };
}

errandsRouter.get("/quote", async (_req, res) => {
  res.json({ ...(await feeRange()), maxKm: PABILI_MAX_KM, budgetMax: await budgetMax() });
});

/**
 * Feasto stores whose name matches the shop being typed: those are ordered from their menu
 * instead, so the store gets the order (and the resident can still choose their rider).
 */
errandsRouter.get("/on-feasto", async (req, res) => {
  const { q } = z.object({ q: z.string().trim().max(60).optional().default("") }).parse(req.query);
  if (q.length < 3) return void res.json({ stores: [] });
  const stores = await prisma.vendor.findMany({
    where: { ...ACTIVE_STORE, name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
    take: 3,
  });
  res.json({ stores });
});

errandsRouter.post("/", perAccount("pabili", 6, 600, "You've asked for a lot of Pabili just now."), async (req, res) => {
  const input = parseBody(errandSchema, req.body);
  await withinBudgetLimit(input.budget);
  const userId = req.session!.userId;
  await refuseIfSuspended(userId, "pabili");
  await refuseWithoutId(userId, "pabili");
  const open = await prisma.errand.count({ where: { residentId: userId, status: { in: ["REQUESTED", "ACCEPTED", "BOUGHT"] } } });
  if (open >= 2) throw new HttpError(409, "You already have two Pabili on the way. Wait for one to arrive first.");
  const address = await addressOf(userId, input.addressId);
  const fee = await feeRange();
  if (input.expectedFee !== undefined && Math.abs(input.expectedFee - fee.min) > 0.001) {
    throw new HttpError(409, `The delivery fee changed to ₱${fee.min} to ₱${fee.max}. Check it, then send your Pabili again.`);
  }
  const rider = input.preferredRiderId ? await chosenRider(input.preferredRiderId) : null;

  const errand = await prisma.errand.create({
    data: {
      residentId: userId,
      preferredRiderId: rider?.id ?? null,
      exclusiveUntil: rider ? new Date(Date.now() + PREFERRED_RIDER_SECONDS * 1000) : null,
      shopName: input.shopName,
      shopAddress: input.shopAddress,
      items: input.items,
      notes: input.notes,
      budget: input.budget,
      deliveryAddress: [address.details, address.landmark].filter(Boolean).join(" · "),
      deliveryLat: address.latitude,
      deliveryLng: address.longitude,
      deliveryFee: fee.min,
      feeMax: fee.max,
    },
    select: { id: true, residentId: true, status: true, shopName: true, deliveryLat: true, deliveryLng: true },
  });
  const resident = req.session!.name.split(" ")[0];
  if (rider) {
    await notify(rider.id, {
      title: `${resident} asked you for a Pabili`,
      body: `Buy at ${input.shopName} (up to ₱${input.budget}). It's yours for ${PREFERRED_RIDER_SECONDS} seconds, then it goes to other riders.`,
      link: "/rider",
    });
  } else {
    await tellNearbyRiders(errand);
  }
  await broadcastErrand(errand);
  res.status(201).json({ errand: { id: errand.id } });
});

const errandView = {
  id: true,
  status: true,
  shopName: true,
  shopAddress: true,
  shopLat: true,
  shopLng: true,
  items: true,
  notes: true,
  budget: true,
  deliveryAddress: true,
  deliveryLat: true,
  deliveryLng: true,
  deliveryFee: true,
  feeMax: true,
  receiptTotal: true,
  receiptPhotoUrl: true,
  deliveryPhotoUrl: true,
  cancelReason: true,
  exclusiveUntil: true,
  createdAt: true,
  acceptedAt: true,
  boughtAt: true,
  finishedAt: true,
} as const;

errandsRouter.get("/", async (req, res) => {
  const errands = await prisma.errand.findMany({
    where: { residentId: req.session!.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { ...errandView, rider: { select: { name: true } } },
  });
  res.json({ errands, budgetMax: await budgetMax(), waitMinutes: ERRAND_WAIT_MINUTES });
});

errandsRouter.get("/:id", async (req, res) => {
  const errand = await prisma.errand.findFirst({
    where: { id: String(req.params.id), residentId: req.session!.userId },
    select: {
      ...errandView,
      preferredRider: { select: { name: true } },
      rider: { select: { name: true, phone: true, riderProfile: { select: { vehicleModel: true, plateNumber: true, ratingSum: true, ratingCount: true } } } },
    },
  });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  const raw = await redis.get(locationKey(errand.id));
  const { rider, ...rest } = errand;
  res.json({
    errand: {
      ...rest,
      rider: rider && {
        name: rider.name,
        phone: rider.phone,
        vehicle: [rider.riderProfile?.vehicleModel, rider.riderProfile?.plateNumber].filter(Boolean).join(" · ") || null,
        rating: rider.riderProfile ? averageOf(rider.riderProfile.ratingSum, rider.riderProfile.ratingCount) : null,
      },
      riderLocation: raw ? (JSON.parse(raw) as { lat: number; lng: number; at: string }) : null,
      total: errand.receiptTotal === null ? null : peso(Number(errand.receiptTotal) + Number(errand.deliveryFee)),
    },
    budgetMax: await budgetMax(),
  });
});

/** Only before a rider takes it: once they're on the way, they may already be buying */
errandsRouter.post("/:id/cancel", async (req, res) => {
  const id = String(req.params.id);
  const errand = await prisma.errand.findFirst({ where: { id, residentId: req.session!.userId }, select: { preferredRiderId: true, exclusiveUntil: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  const { count } = await prisma.errand.updateMany({
    where: { id, residentId: req.session!.userId, status: "REQUESTED" },
    data: { status: "CANCELLED", cancelReason: "Cancelled by you", finishedAt: new Date() },
  });
  if (count === 0) throw new HttpError(409, "A rider already took this Pabili, so it can't be cancelled. Call them instead.");
  await broadcastErrand({ id, residentId: req.session!.userId, status: "CANCELLED" });
  res.json({ ok: true });
});

/** Raise what the rider may spend (something cost more than expected), until they've bought it */
errandsRouter.post("/:id/budget", async (req, res) => {
  const id = String(req.params.id);
  const { budget } = parseBody(z.object({ budget: errandSchema.shape.budget }), req.body);
  await withinBudgetLimit(budget);
  const errand = await prisma.errand.findFirst({ where: { id, residentId: req.session!.userId }, select: { budget: true, riderId: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  if (budget < Number(errand.budget)) throw new ValidationError({ budget: ["The budget can only go up once it's sent. Enter more than it is now."] });
  const { count } = await prisma.errand.updateMany({ where: { id, residentId: req.session!.userId, status: { in: ["REQUESTED", "ACCEPTED"] } }, data: { budget } });
  if (count === 0) throw new HttpError(409, "The rider already bought everything, so the budget can't change.");
  if (errand.riderId) await notify(errand.riderId, { title: `The budget is now ₱${budget}`, body: "The customer raised what you may spend on this Pabili.", link: "/rider/active" });
  await broadcastErrand({ id, residentId: req.session!.userId, status: "ACCEPTED" });
  res.json({ ok: true });
});

// ---------- Riders: taking and running a Pabili ----------

export const riderErrandsRouter = Router();
riderErrandsRouter.use(requireAuth, requireRole("RIDER"));

/** A Pabili this rider may take: asked for them, or open to everyone after the asked rider's moment */
const visibleTo = (userId: string) => ({
  status: "REQUESTED" as const,
  OR: [{ preferredRiderId: userId }, { exclusiveUntil: null }, { exclusiveUntil: { lt: new Date() } }],
});

async function freeRiderProfile(userId: string) {
  const profile = await prisma.riderProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== "APPROVED") throw new HttpError(403, "Your rider account isn't approved yet.");
  return profile;
}

riderErrandsRouter.get("/errands", async (req, res) => {
  const userId = req.session!.userId;
  const profile = await freeRiderProfile(userId);
  // A store's own riders only deliver for their store
  if (profile.vendorId || !profile.isOnline) return void res.json({ errands: [] });
  const errands = await prisma.errand.findMany({
    where: visibleTo(userId),
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true,
      shopName: true,
      shopAddress: true,
      deliveryLat: true,
      deliveryLng: true,
      items: true,
      budget: true,
      deliveryFee: true,
      feeMax: true,
      deliveryAddress: true,
      preferredRiderId: true,
      exclusiveUntil: true,
      createdAt: true,
      resident: { select: { name: true } },
    },
  });
  // How far the rider is from each customer (the shop has no pin), from the position their phone last sent
  const away = await Promise.all(
    errands.map((e) => (e.deliveryLat != null && e.deliveryLng != null ? riderDistances({ lat: e.deliveryLat, lng: e.deliveryLng }, new Set([userId])) : new Map<string, number>())),
  );
  res.json({
    errands: errands.map(({ resident, preferredRiderId, items, deliveryLat: _lat, deliveryLng: _lng, ...e }, i) => ({
      ...e,
      distanceKm: away[i]!.has(userId) ? Math.round(away[i]!.get(userId)! * 10) / 10 : null,
      itemCount: (items as unknown[]).length,
      customer: shortName(resident.name),
      askedForYou: preferredRiderId === userId,
    })),
  });
});

riderErrandsRouter.post("/errands/:id/accept", async (req, res) => {
  const userId = req.session!.userId;
  const id = String(req.params.id);
  const profile = await freeRiderProfile(userId);
  if (profile.vendorId) throw new HttpError(403, "Store riders deliver only for their store.");
  if (!profile.isOnline) throw new HttpError(400, "Go online to take a Pabili.");
  if (hasExpired(profile.licenseExpiresAt)) throw new HttpError(403, "Your driver's license has expired. Upload your renewed license to take jobs.");
  await refuseIfSuspended(userId, "jobs");

  // The same per-rider lock as delivery jobs: two quick taps can't make the rider busy twice
  const lock = `lock:rider:${userId}`;
  if ((await redis.set(lock, "1", "EX", 10, "NX")) !== "OK") throw new HttpError(429, "Hold on, still accepting your last job.");
  try {
    if (await riderIsBusy(userId)) throw new HttpError(409, "Finish your current job first.");
    // Only one rider's UPDATE gets through, even when several tap at once on different API copies
    const { count } = await prisma.errand.updateMany({ where: { id, ...visibleTo(userId) }, data: { riderId: userId, status: "ACCEPTED", acceptedAt: new Date(), exclusiveUntil: null } });
    if (count === 0) throw new HttpError(409, "Another rider already took this Pabili, or it was cancelled.");
  } finally {
    await redis.del(lock);
  }
  const errand = await prisma.errand.findUniqueOrThrow({ where: { id }, select: { id: true, residentId: true, status: true, shopName: true } });
  await notify(errand.residentId, {
    title: `${req.session!.name.split(" ")[0]} took your Pabili`,
    body: `They're on the way to ${errand.shopName}. You pay what the receipt says, plus the delivery fee, in cash when it arrives.`,
    link: `/resident/pabili/${id}`,
  });
  await broadcastErrand(errand);
  res.json({ ok: true });
});

/** The rider's current Pabili, for the Active tab */
riderErrandsRouter.get("/errands/active", async (req, res) => {
  const errand = await prisma.errand.findFirst({
    where: { riderId: req.session!.userId, status: { in: ["ACCEPTED", "BOUGHT"] } },
    select: { ...errandView, resident: { select: { name: true, phone: true } } },
  });
  res.json({ errand });
});

const boughtSchema = z.object({
  receiptPhotoUrl: z.string().regex(UPLOADED_PHOTO, "Take a photo of the receipt first."),
  // Never more than the budget (checked below), which the admin's limit already caps
  receiptTotal: z.number("Enter the receipt's total.").positive("Enter the receipt's total.").max(100000),
});

/**
 * Where the rider is as they tap "Bought": the last spot their phone shared for this Pabili (the
 * same live location the customer follows), if it's recent. None means no check.
 */
async function riderSpot(errandId: string) {
  const raw = await redis.get(locationKey(errandId));
  if (!raw) return null;
  const last = JSON.parse(raw) as { lat: number; lng: number; at: string };
  return Date.now() - new Date(last.at).getTime() < 3 * 60_000 ? last : null;
}

riderErrandsRouter.post("/errands/:id/bought", async (req, res) => {
  const id = String(req.params.id);
  const userId = req.session!.userId;
  const input = parseBody(boughtSchema, req.body);
  const errand = await prisma.errand.findFirst({
    where: { id, riderId: userId },
    select: { budget: true, residentId: true, deliveryFee: true, feeMax: true, deliveryLat: true, deliveryLng: true },
  });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  if (input.receiptTotal > Number(errand.budget) + 0.001) {
    throw new ValidationError({ receiptTotal: [`That's over the ₱${peso(errand.budget)} budget. Call the customer: they can raise it in the app.`] });
  }

  // The shop is where the rider is as they buy: the fee is worked out from there to the customer,
  // never above the most the resident was shown. Without a recent spot, the lowest fee stays.
  const at = await riderSpot(id);
  let fee = Number(errand.deliveryFee);
  if (at) {
    const quote = await feeFor(at, { latitude: errand.deliveryLat, longitude: errand.deliveryLng });
    fee = Math.min(quote.fee, Number(errand.feeMax ?? quote.fee));
  }

  const { count } = await prisma.errand.updateMany({
    where: { id, riderId: userId, status: "ACCEPTED" },
    data: {
      status: "BOUGHT",
      boughtAt: new Date(),
      receiptTotal: input.receiptTotal,
      receiptPhotoUrl: input.receiptPhotoUrl,
      deliveryFee: fee,
      ...(at && { shopLat: at.lat, shopLng: at.lng }),
    },
  });
  if (count === 0) throw new HttpError(409, "This Pabili isn't waiting to be bought anymore. Refresh to see the latest.");
  const total = peso(input.receiptTotal + fee);
  await notify(errand.residentId, {
    title: "Your Pabili was bought",
    body: `The receipt says ₱${peso(input.receiptTotal)}, and the delivery fee is ₱${peso(fee)}${at ? ", from where the rider bought to you" : ""}. Have ₱${total} ready in cash.`,
    link: `/resident/pabili/${id}`,
  });
  await broadcastErrand({ id, residentId: errand.residentId, status: "BOUGHT" });
  res.json({ ok: true, fee: peso(fee), collect: total, fromGps: Boolean(at) });
});

riderErrandsRouter.post("/errands/:id/delivered", async (req, res) => {
  const id = String(req.params.id);
  const userId = req.session!.userId;
  const { photoUrl } = parseBody(z.object({ photoUrl: z.string().regex(UPLOADED_PHOTO, "Take a photo of the handed-over items first.") }), req.body);
  const errand = await prisma.errand.findFirst({ where: { id, riderId: userId }, select: { residentId: true, receiptTotal: true, deliveryFee: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  const { count } = await prisma.errand.updateMany({ where: { id, riderId: userId, status: "BOUGHT" }, data: { status: "DELIVERED", finishedAt: new Date(), deliveryPhotoUrl: photoUrl } });
  if (count === 0) throw new HttpError(409, "Upload the receipt first, then finish the delivery.");
  await redis.del(locationKey(id));
  await notify(errand.residentId, { title: "Your Pabili arrived", body: "Thanks for using Feasto Pabili!", link: `/resident/pabili/${id}` });
  await broadcastErrand({ id, residentId: errand.residentId, status: "DELIVERED" });
  res.json({ ok: true, earned: peso(errand.deliveryFee), collect: peso(Number(errand.receiptTotal ?? 0) + Number(errand.deliveryFee)) });
});

/**
 * The rider's live position for a Pabili, sent like a delivery's (rider.ts /location hands Pabili
 * ids here): kept in Redis and pushed to the resident's open page through Redis pub/sub.
 */
export async function shareErrandLocation(userId: string, errandId: string, lat: number, lng: number) {
  const errand = await prisma.errand.findFirst({ where: { id: errandId, riderId: userId, status: { in: ["ACCEPTED", "BOUGHT"] } }, select: { residentId: true } });
  if (!errand) return false;
  const at = new Date().toISOString();
  await redis.set(locationKey(errandId), marshal({ lat, lng, at }, { transport: "redis", channel: locationKey(errandId), kind: "rider location" }), "EX", 3600);
  await publish(CHANNELS.user(errand.residentId), { type: "rider.location", orderId: errandId, lat, lng, at });
  return true;
}
