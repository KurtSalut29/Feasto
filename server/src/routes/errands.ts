import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import { config } from "../config.js";
import type { ShopCategory } from "../generated/prisma/enums.js";
import { CATEGORY_LABEL, estimateOf, IF_MISSING, NOT_BOUGHT, NOT_BOUGHT_LABEL, ageOn, priceFlagFor, restrictedTerms, screen, SHOP_CATEGORIES, UNITS, type PabiliItem } from "../lib/pabili.js";
import { notifyAdmin } from "../lib/activity.js";
import { removeDocument } from "../lib/renewals.js";
import { CONTENT_TYPE, detectDocumentType, MAX_BYTES, sendDocument } from "./documents.js";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { priceDelivery, quoteDelivery } from "../lib/deliveryFee.js";
import { pabiliCut } from "../lib/earnings.js";
import { addOnNote, addOnsFor, addOnTotal } from "../lib/feeAddOns.js";
import { PREFERRED_RIDER_SECONDS, riderIsBusy, riderDistances, saveRiderPosition } from "../lib/dispatch.js";
import { endRide, recordPosition } from "../lib/daloy.js";
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
import { listReaderOn, readList } from "../lib/listReader.js";
import { payRiderBack, prepaidAmount, refundPabili, startPabiliPayment, syncPabiliPayment } from "../lib/pabiliPay.js";
import { expireInvoice } from "../lib/xendit.js";
import { originOf } from "./checkout.js";

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

/** One line of the list: how much, in what unit, the details, a guess at the price, and what to do if it's not there */
const itemSchema = z
  .object({
    name: z.string("Write what to buy.").trim().min(2, "Write what to buy.").max(80),
    quantity: z
      .number("Enter how many.")
      .positive("Enter more than 0.")
      .max(500, "500 at most.")
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most two decimal places, like 1.5 or 0.25."),
    unit: z.enum(UNITS, "Choose a unit from the list.").optional().default("pc"),
    note: z.string().trim().max(120).optional().transform((v) => v || null),
    estimate: z.number("Enter the price in pesos.").min(0).max(100000).nullish().transform((v) => v || null),
    ifMissing: z.enum(IF_MISSING).optional().default("CALL"),
    replacement: z.string().trim().max(80).nullish().transform((v) => v || null),
    prescription: z.boolean().optional().default(false),
  })
  .refine((i) => i.ifMissing !== "REPLACE" || Boolean(i.replacement), { message: "Say what to get instead.", path: ["replacement"] });

const errandSchema = z.object({
  /** A shop from the list (by kind). Or one that isn't listed: its name, where it is and its kind, which also asks the admin to add it. */
  shopId: z.string().min(1).optional(),
  shopName: z.string().trim().max(80).optional().default(""),
  shopAddress: z.string().trim().max(200).optional().default(""),
  shopCategory: z.enum(SHOP_CATEGORIES, "Choose what kind of shop it is.").optional(),
  /** The prescription's photo, uploaded first (PUT /errands/prescription) */
  prescriptionFile: z.string().regex(/^[a-f0-9]{32}\.(jpg|png|webp|pdf)$/).optional(),
  /** As on the ID, the first time alcohol or cigarettes are on a list */
  birthDate: z.iso.date("Enter your birth date.").optional(),
  items: z.array(itemSchema).min(1, "Add at least one thing to buy.").max(20, "20 things at most in one Pabili."),
  notes: z.string().trim().max(200).optional().transform((v) => v || null),
  /** The most is the admin's setting, checked by withinBudgetLimit */
  budget: z.number("Enter how much the rider may spend.").min(PABILI_BUDGET_MIN, `Enter at least ₱${PABILI_BUDGET_MIN}.`),
  addressId: z.string().min(1, "Choose where to deliver it."),
  /** Ask a particular rider first; without it, the free riders nearest the shop hear about it */
  preferredRiderId: z.string().min(1).optional(),
  /** The lowest fee the resident saw; if it changed in the meantime, they're asked to look again */
  expectedFee: z.number().optional(),
  /** Pay the budget and the most fee online first (needed above the cash limit): nothing is paid at the door */
  payOnline: z.boolean().optional().default(false),
  onlineMethod: z.enum(["GCASH", "MAYA", "GRABPAY", "SHOPEEPAY", "COINS", "VISA", "MASTERCARD", "JCB", "AMEX"]).optional(),
});

const budgetMax = async () => (await getSettings()).pabiliBudgetMax;

/**
 * Paid in cash, the rider lends the money at the shop, so the budget stays within the admin's cash
 * limit. Paid online first, it can go up to the prepaid limit.
 */
async function withinBudgetLimit(budget: number, payOnline = false) {
  const settings = await getSettings();
  const cash = settings.pabiliBudgetMax;
  const prepaid = Math.max(cash, settings.pabiliPrepaidMax);
  const php = (n: number) => `₱${n.toLocaleString("en-PH")}`;
  if (payOnline && budget > prepaid) throw new ValidationError({ budget: [`${php(prepaid)} is the most for one Pabili paid online. Lower the budget, or split your list into two Pabili.`] });
  if (!payOnline && budget > cash) {
    throw new ValidationError({
      budget: [
        prepaid > cash
          ? `Above ${php(cash)}, pay online first (up to ${php(prepaid)}): the rider can't lend that much in cash.`
          : `${php(cash)} is the most for one Pabili, because the rider pays at the shop with their own money. Lower the budget, or split your list into two Pabili.`,
      ],
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
async function feeRange(userId: string) {
  const settings = await getSettings();
  // Busy or rain right now: added to both ends, and all of it is the rider's
  const addOns = await addOnsFor(userId, settings);
  return { min: priceDelivery(null, settings, addOns).fee, max: priceDelivery(PABILI_MAX_KM, settings, addOns).fee, addOns, cutPercent: settings.pabiliFeePercent };
}

errandsRouter.get("/quote", async (req, res) => {
  const { addOns, cutPercent: _cut, ...range } = await feeRange(req.session!.userId);
  res.json({ ...range, ...addOns, maxKm: PABILI_MAX_KM, budgetMax: await budgetMax() });
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

/** The shop: one from the list, or a typed one (the admin is asked to add it) */
async function shopFor(input: { shopId?: string; shopName: string; shopAddress: string; shopCategory?: ShopCategory }, userId: string) {
  if (input.shopId) {
    const listed = await prisma.pabiliShop.findFirst({ where: { id: input.shopId, isActive: true } });
    if (!listed) throw new ValidationError({ shopId: ["That shop isn't on the list anymore. Choose another one."] });
    return { id: listed.id, name: listed.name, address: [listed.landmark, listed.barangay].filter(Boolean).join(", "), category: listed.category };
  }
  const problems = {
    ...(input.shopName.length < 2 && { shopName: ["Enter the shop's name."] }),
    ...(input.shopAddress.length < 3 && { shopAddress: ["Say where the shop is, like the street or a landmark."] }),
    ...(!input.shopCategory && { shopCategory: ["Choose what kind of shop it is."] }),
  };
  if (Object.keys(problems).length) throw new ValidationError(problems);
  await suggestShop(userId, input.shopName, input.shopCategory!, input.shopAddress);
  return { id: null, name: input.shopName, address: input.shopAddress, category: input.shopCategory! };
}

/** A shop someone used that isn't listed: once per name while the admin hasn't looked */
async function suggestShop(userId: string, name: string, category: ShopCategory, location: string) {
  const known = await prisma.pabiliShopSuggestion.findFirst({ where: { status: "OPEN", name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  const listed = await prisma.pabiliShop.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (known || listed) return false;
  await prisma.pabiliShopSuggestion.create({ data: { userId, name, category, location } });
  await notifyAdmin({ title: `Add ${name} to Pabili?`, body: `A resident asked for it (${CATEGORY_LABEL[category]}, ${location}).`, link: "/admin/pabili" });
  return true;
}

const prescriptionKey = (userId: string, file: string) => `rx:${userId}:${file}`;

/**
 * The list checked against the rules: nothing banned, medicine with a prescription from a botika,
 * alcohol and cigarettes only for a verified adult. Returns the list as kept (with each item's flags).
 */
async function checkList(
  input: { items: z.infer<typeof itemSchema>[]; notes: string | null; prescriptionFile?: string; birthDate?: string; budget: number },
  category: ShopCategory,
  userId: string,
) {
  const { liquorBan } = await getSettings();
  const result = screen(input.items, input.notes, await restrictedTerms(), { liquorBan });
  if (result.blocked.length) {
    throw new ValidationError(Object.fromEntries(result.blocked.map((b) => [b.index < 0 ? "notes" : `items.${b.index}`, [b.message]])));
  }
  let prescriptionFile: string | null = null;
  if (result.needsPrescription) {
    if (category !== "PHARMACY") throw new ValidationError({ shopCategory: ["Medicine that needs a prescription is bought only at a botika. Choose a botika, or take it off this list."] });
    if (!input.prescriptionFile || !(await redis.exists(prescriptionKey(userId, input.prescriptionFile)))) {
      throw new ValidationError({ prescription: ["Add a photo of the prescription: the doctor's name and PRC number, the date and your name. The pharmacist still decides."] });
    }
    prescriptionFile = input.prescriptionFile;
  }
  if (result.adult) {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { idStatus: true, birthDate: true } });
    if (me.idStatus !== "VERIFIED") throw new HttpError(403, "Alcohol and cigarettes need a verified ID. The admin hasn't verified yours yet: take them off this list for now.");
    const typed = !me.birthDate && input.birthDate ? new Date(`${input.birthDate}T00:00:00Z`) : null;
    if (typed && (ageOn(typed) > 110 || typed > new Date())) throw new ValidationError({ birthDate: ["Enter your birth date as on your ID."] });
    const birth = me.birthDate ?? typed;
    if (!birth) throw new ValidationError({ birthDate: ["Alcohol and cigarettes are for 18 and older. Enter your birth date, as on your ID."] });
    if (ageOn(birth) < 18) throw new HttpError(403, "Alcohol and cigarettes are for 18 and older, so they can't be on your Pabili.");
    // Kept once it's an adult's (a typo that makes someone a child isn't kept, so it can be fixed); the rider still checks the ID
    if (typed) await prisma.user.update({ where: { id: userId }, data: { birthDate: typed } });
  }
  const items: PabiliItem[] = input.items.map((item, i) => ({ ...item, flags: result.flags[i], notBought: null }) as PabiliItem);
  const estimate = estimateOf(items);
  if (estimate && estimate > input.budget + 0.001) {
    throw new ValidationError({ budget: [`Your estimates add up to ₱${estimate.toFixed(2)}, more than the budget. Raise the budget, or lower the estimates.`] });
  }
  return { items, estimate, prescriptionFile, adult: result.adult, handling: result.handling };
}

/** The photo of a prescription, kept private like an ID. Used on the Pabili sent within two hours. */
errandsRouter.put(
  "/prescription",
  perAccount("upload", 30, 600, "You've uploaded a lot of files just now."),
  express.raw({ type: Object.values(CONTENT_TYPE), limit: MAX_BYTES }),
  async (req, res) => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Choose a photo or PDF of the prescription.");
    const extension = detectDocumentType(data);
    if (!extension) throw new HttpError(400, "That file isn't a JPG, PNG, WebP or PDF.");
    const name = `${randomBytes(16).toString("hex")}.${extension}`;
    await mkdir(config.documentDir, { recursive: true });
    await writeFile(path.join(config.documentDir, name), data);
    await redis.set(prescriptionKey(req.session!.userId, name), "1", "EX", 7200);
    res.json({ file: name });
  },
);

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * A shopping list read for the resident (photo, PDF or Word file): the lines come back for the form,
 * to check and change before sending. Nothing is kept: the file is read and dropped.
 */
errandsRouter.post(
  "/read-list",
  perAccount("list-read", 12, 3600, "You've read a lot of lists just now. Type the items, or try again later."),
  express.raw({ type: [...Object.values(CONTENT_TYPE), DOCX], limit: MAX_BYTES }),
  async (req, res) => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Choose a photo, PDF or Word file of your list.");
    const isZip = data.readUInt32LE(0) === 0x04034b50;
    const kind = isZip ? "docx" : detectDocumentType(data);
    if (!kind) throw new HttpError(400, "That file isn't a photo (JPG, PNG, WebP), a PDF or a Word file.");
    const result = await readList(data, kind);
    if (result.problem && !result.items.length) throw new HttpError(422, result.problem);
    res.json(result);
  },
);

/** The rules the form checks as the resident types (the server checks again on sending) */
errandsRouter.get("/rules", async (req, res) => {
  const { liquorBan } = await getSettings();
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.session!.userId }, select: { idStatus: true, birthDate: true } });
  res.json({
    terms: await restrictedTerms(),
    liquorBan,
    categories: CATEGORY_LABEL,
    units: UNITS,
    // Alcohol and cigarettes: whether a birth date is still needed, and whether the ID is verified
    me: { idVerified: me.idStatus === "VERIFIED", hasBirthDate: Boolean(me.birthDate), adult: me.birthDate ? ageOn(me.birthDate) >= 18 : null },
    // Whether a list can be read from a photo or file (Claude, with ANTHROPIC_API_KEY)
    listReader: listReaderOn(),
  });
});

/** The listed shops of one kind (or all), with the ones on Feasto pointing to their menu */
errandsRouter.get("/shops", async (req, res) => {
  const { category, q } = z.object({ category: z.enum(SHOP_CATEGORIES).optional(), q: z.string().trim().max(60).optional() }).parse(req.query);
  const shops = await prisma.pabiliShop.findMany({
    where: { isActive: true, ...(category && { category }), ...(q && { name: { contains: q, mode: "insensitive" } }) },
    orderBy: { name: "asc" },
    take: 100,
    select: { id: true, name: true, category: true, barangay: true, landmark: true, hours: true, vendor: { select: { id: true, name: true, status: true } } },
  });
  const counts = await prisma.pabiliShop.groupBy({ by: ["category"], where: { isActive: true }, _count: { _all: true } });
  res.json({
    shops: shops.map(({ vendor, ...s }) => ({ ...s, onFeasto: vendor?.status === "APPROVED" ? { id: vendor.id, name: vendor.name } : null })),
    counts: Object.fromEntries(counts.map((c) => [c.category, c._count._all])),
  });
});

/** "Not on the list? Ask to add it", without sending a Pabili */
errandsRouter.post("/shops/suggest", perAccount("shop-suggest", 10, 3600, "You've suggested a lot of shops just now."), async (req, res) => {
  const input = parseBody(
    z.object({
      name: z.string().trim().min(2, "Enter the shop's name.").max(80),
      category: z.enum(SHOP_CATEGORIES, "Choose what kind of shop it is."),
      location: z.string().trim().min(3, "Say where it is, like the street or a landmark.").max(200),
    }),
    req.body,
  );
  const added = await suggestShop(req.session!.userId, input.name, input.category, input.location);
  res.status(added ? 201 : 200).json({ ok: true, alreadyAsked: !added });
});

errandsRouter.post("/", perAccount("pabili", 6, 600, "You've asked for a lot of Pabili just now."), async (req, res) => {
  const input = parseBody(errandSchema, req.body);
  await withinBudgetLimit(input.budget, input.payOnline);
  const userId = req.session!.userId;
  await refuseIfSuspended(userId, "pabili");
  await refuseWithoutId(userId, "pabili");
  const open = await prisma.errand.count({ where: { residentId: userId, status: { in: ["REQUESTED", "ACCEPTED", "BOUGHT"] } } });
  if (open >= 2) throw new HttpError(409, "You already have two Pabili on the way. Wait for one to arrive first.");
  const address = await addressOf(userId, input.addressId);
  const shop = await shopFor(input, userId);
  const checked = await checkList(input, shop.category, userId);
  const fee = await feeRange(userId);
  const extraFee = addOnTotal(fee.addOns);
  if (input.expectedFee !== undefined && Math.abs(input.expectedFee - fee.min) > 0.001) {
    throw new HttpError(409, `The delivery fee changed to ₱${fee.min} to ₱${fee.max}. Check it, then send your Pabili again.`);
  }
  const rider = input.preferredRiderId ? await chosenRider(input.preferredRiderId) : null;

  const errand = await prisma.errand.create({
    data: {
      residentId: userId,
      preferredRiderId: rider?.id ?? null,
      // Paid online first: the asked rider's moment starts once it's paid
      exclusiveUntil: rider && !input.payOnline ? new Date(Date.now() + PREFERRED_RIDER_SECONDS * 1000) : null,
      ...(input.payOnline && { prepaid: true, paymentStatus: "PENDING" as const }),
      shopId: shop.id,
      shopName: shop.name,
      shopAddress: shop.address,
      shopCategory: shop.category,
      items: checked.items,
      notes: input.notes,
      prescriptionFile: checked.prescriptionFile,
      adultCheck: checked.adult,
      handling: checked.handling,
      estimateTotal: checked.estimate,
      budget: input.budget,
      deliveryAddress: [address.details, address.landmark].filter(Boolean).join(" · "),
      deliveryLat: address.latitude,
      deliveryLng: address.longitude,
      deliveryFee: fee.min,
      feeMax: fee.max,
      extraFee,
      extraFeeNote: addOnNote(fee.addOns),
      feastoCutRate: fee.cutPercent,
      feastoCut: pabiliCut(fee.min, extraFee, fee.cutPercent),
    },
    select: { id: true, residentId: true, status: true, shopName: true, deliveryLat: true, deliveryLng: true },
  });
  // Paid online first: riders hear about it once Xendit says it's paid (lib/pabiliPay.ts)
  if (input.payOnline) {
    const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const paymentUrl = await startPabiliPayment(errand.id, originOf(req), input.onlineMethod ?? null, me.email).catch(() => {
      throw new HttpError(502, "The payment page couldn't be opened, so the Pabili wasn't sent. Try again in a minute, or pay in cash.");
    });
    await broadcastErrand(errand);
    return void res.status(201).json({ errand: { id: errand.id }, paymentUrl });
  }
  const resident = req.session!.name.split(" ")[0];
  if (rider) {
    await notify(rider.id, {
      title: `${resident} asked you for a Pabili`,
      body: `Buy at ${shop.name} (up to ₱${input.budget}). It's yours for ${PREFERRED_RIDER_SECONDS} seconds, then it goes to other riders.`,
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
  shopCategory: true,
  adultCheck: true,
  handling: true,
  estimateTotal: true,
  itemsPhotoUrl: true,
  priceFlag: true,
  idCheckedAt: true,
  confirmedAt: true,
  prepaid: true,
  paymentStatus: true,
  paymentUrl: true,
  paidAmount: true,
  refundedAmount: true,
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
  const settings = await getSettings();
  res.json({ errands, budgetMax: settings.pabiliBudgetMax, prepaidMax: Math.max(settings.pabiliBudgetMax, settings.pabiliPrepaidMax), waitMinutes: ERRAND_WAIT_MINUTES });
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
  const hasPrescription = Boolean((await prisma.errand.findUnique({ where: { id: errand.id }, select: { prescriptionFile: true } }))?.prescriptionFile);
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
      hasPrescription,
      total: errand.receiptTotal === null ? null : peso(Number(errand.receiptTotal) + Number(errand.deliveryFee)),
    },
    budgetMax: await budgetMax(),
  });
});

/** Only before a rider takes it: once they're on the way, they may already be buying */
errandsRouter.post("/:id/cancel", async (req, res) => {
  const id = String(req.params.id);
  const errand = await prisma.errand.findFirst({ where: { id, residentId: req.session!.userId }, select: { preferredRiderId: true, exclusiveUntil: true, prepaid: true, paymentStatus: true, paymentRef: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  // Still waiting for the payment: close the page first, so it can't be paid after the cancel
  if (errand.prepaid && errand.paymentStatus === "PENDING") {
    if ((await syncPabiliPayment(id).catch(() => "PENDING")) === "PENDING" && errand.paymentRef) await expireInvoice(errand.paymentRef).catch(() => null);
  }
  const { count } = await prisma.errand.updateMany({
    where: { id, residentId: req.session!.userId, status: "REQUESTED" },
    data: { status: "CANCELLED", cancelReason: "Cancelled by you", finishedAt: new Date() },
  });
  if (count === 0) throw new HttpError(409, "A rider already took this Pabili, so it can't be cancelled. Call them instead.");
  const refunded = await refundPabili(id, Number.MAX_SAFE_INTEGER, "You cancelled your Pabili.");
  await broadcastErrand({ id, residentId: req.session!.userId, status: "CANCELLED" });
  res.json({ ok: true, refunded });
});

/** Back from Xendit's page: how the payment went (asks Xendit, so it works without the webhook) */
errandsRouter.get("/:id/payment", async (req, res) => {
  const id = String(req.params.id);
  const mine = await prisma.errand.findFirst({ where: { id, residentId: req.session!.userId, prepaid: true }, select: { id: true } });
  if (!mine) throw new HttpError(404, "We couldn't find this Pabili.");
  res.json({ status: await syncPabiliPayment(id).catch(() => null) });
});

/** Raise what the rider may spend (something cost more than expected), until they've bought it */
errandsRouter.post("/:id/budget", async (req, res) => {
  const id = String(req.params.id);
  const { budget } = parseBody(z.object({ budget: errandSchema.shape.budget }), req.body);
  const errand = await prisma.errand.findFirst({ where: { id, residentId: req.session!.userId }, select: { budget: true, riderId: true, prepaid: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  if (errand.prepaid) throw new HttpError(409, "This Pabili was paid online, so its budget can't go up. Call the rider: they can skip something, or buy less.");
  await withinBudgetLimit(budget);
  if (budget < Number(errand.budget)) throw new ValidationError({ budget: ["The budget can only go up once it's sent. Enter more than it is now."] });
  const { count } = await prisma.errand.updateMany({ where: { id, residentId: req.session!.userId, status: { in: ["REQUESTED", "ACCEPTED"] } }, data: { budget } });
  if (count === 0) throw new HttpError(409, "The rider already bought everything, so the budget can't change.");
  if (errand.riderId) await notify(errand.riderId, { title: `The budget is now ₱${budget}`, body: "The customer raised what you may spend on this Pabili.", link: "/rider/active" });
  await broadcastErrand({ id, residentId: req.session!.userId, status: "ACCEPTED" });
  res.json({ ok: true });
});

errandsRouter.get("/:id/prescription", async (req, res) => {
  const errand = await prisma.errand.findFirst({ where: { id: String(req.params.id), residentId: req.session!.userId }, select: { prescriptionFile: true } });
  if (!errand?.prescriptionFile) throw new HttpError(404, "There's no prescription on this Pabili.");
  await sendDocument(res, errand.prescriptionFile);
});

/** "I got everything": the resident's word at the door, after the rider's photo */
errandsRouter.post("/:id/confirm", async (req, res) => {
  const { count } = await prisma.errand.updateMany({
    where: { id: String(req.params.id), residentId: req.session!.userId, status: "DELIVERED", confirmedAt: null },
    data: { confirmedAt: new Date() },
  });
  if (count === 0) throw new HttpError(409, "This Pabili isn't waiting for your confirmation.");
  res.json({ ok: true });
});

// ---------- Riders: taking and running a Pabili ----------

export const riderErrandsRouter = Router();
riderErrandsRouter.use(requireAuth, requireRole("RIDER"));

/** A Pabili this rider may take: asked for them, or open to everyone after the asked rider's moment */
const visibleTo = (userId: string) => ({
  status: "REQUESTED" as const,
  AND: [{ OR: [{ preferredRiderId: userId }, { exclusiveUntil: null }, { exclusiveUntil: { lt: new Date() } }] }, { OR: [{ prepaid: false }, { paymentStatus: "PAID" as const }] }],
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
      shopCategory: true,
      adultCheck: true,
      handling: true,
      prescriptionFile: true,
      prepaid: true,
      resident: { select: { name: true } },
    },
  });
  // How far the rider is from each customer (the shop has no pin), from the position their phone last sent
  const away = await Promise.all(
    errands.map((e) => (e.deliveryLat != null && e.deliveryLng != null ? riderDistances({ lat: e.deliveryLat, lng: e.deliveryLng }, new Set([userId])) : new Map<string, number>())),
  );
  res.json({
    errands: errands.map(({ resident, preferredRiderId, items, deliveryLat: _lat, deliveryLng: _lng, prescriptionFile, ...e }, i) => ({
      ...e,
      needsPrescription: Boolean(prescriptionFile),
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
  const errand = await prisma.errand.findUniqueOrThrow({ where: { id }, select: { id: true, residentId: true, status: true, shopName: true, prepaid: true } });
  await notify(errand.residentId, {
    title: `${req.session!.name.split(" ")[0]} took your Pabili`,
    body: errand.prepaid
      ? `They're on the way to ${errand.shopName}. It's paid online: what isn't used comes back to you once they buy.`
      : `They're on the way to ${errand.shopName}. You pay what the receipt says, plus the delivery fee, in cash when it arrives.`,
    link: `/resident/pabili/${id}`,
  });
  await broadcastErrand(errand);
  res.json({ ok: true });
});

/** The rider's current Pabili, for the Active tab */
riderErrandsRouter.get("/errands/active", async (req, res) => {
  const errand = await prisma.errand.findFirst({
    where: { riderId: req.session!.userId, status: { in: ["ACCEPTED", "BOUGHT"] } },
    select: { ...errandView, prescriptionFile: true, resident: { select: { name: true, phone: true } } },
  });
  if (!errand) return void res.json({ errand: null });
  const { prescriptionFile, ...rest } = errand;
  res.json({ errand: { ...rest, hasPrescription: Boolean(prescriptionFile) } });
});

riderErrandsRouter.get("/errands/:id/prescription", async (req, res) => {
  const errand = await prisma.errand.findFirst({ where: { id: String(req.params.id), riderId: req.session!.userId }, select: { prescriptionFile: true } });
  if (!errand?.prescriptionFile) throw new HttpError(404, "There's no prescription on this Pabili.");
  await sendDocument(res, errand.prescriptionFile);
});

/** At the shop: an item that couldn't be bought, and why (or null to undo). The customer is told at once. */
riderErrandsRouter.post("/errands/:id/items/:index/not-bought", async (req, res) => {
  const id = String(req.params.id);
  const index = Number(req.params.index);
  const { reason } = parseBody(z.object({ reason: z.enum(NOT_BOUGHT).nullable() }), req.body);
  const errand = await prisma.errand.findFirst({ where: { id, riderId: req.session!.userId, status: "ACCEPTED" }, select: { items: true, residentId: true } });
  if (!errand) throw new HttpError(409, "This Pabili isn't being bought now.");
  const items = errand.items as PabiliItem[];
  if (!Number.isInteger(index) || !items[index]) throw new HttpError(404, "That item isn't on the list.");
  items[index] = { ...items[index]!, notBought: reason ? { reason, at: new Date().toISOString() } : null };
  if (items.every((i) => i.notBought)) throw new HttpError(409, "Nothing would be left to buy. If nothing on the list can be bought, tap “Nothing could be bought”.");
  const { count } = await prisma.errand.updateMany({ where: { id, riderId: req.session!.userId, status: "ACCEPTED" }, data: { items } });
  if (count === 0) throw new HttpError(409, "This Pabili isn't being bought now.");
  if (reason) {
    await notify(errand.residentId, { title: `${items[index]!.name} wasn't bought`, body: `The rider says: ${NOT_BOUGHT_LABEL[reason]}. The rest of your list is still being bought.`, link: `/resident/pabili/${id}` });
  }
  await broadcastErrand({ id, residentId: errand.residentId, status: "ACCEPTED" });
  res.json({ ok: true, items });
});

/** Nothing on the list could be bought: the Pabili ends, and nobody pays anything */
riderErrandsRouter.post("/errands/:id/nothing-bought", async (req, res) => {
  const id = String(req.params.id);
  const { reason } = parseBody(z.object({ reason: z.enum(NOT_BOUGHT) }), req.body);
  const errand = await prisma.errand.findFirst({ where: { id, riderId: req.session!.userId }, select: { residentId: true, shopName: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  const { count } = await prisma.errand.updateMany({
    where: { id, riderId: req.session!.userId, status: "ACCEPTED" },
    data: { status: "CANCELLED", cancelReason: `Nothing could be bought: ${NOT_BOUGHT_LABEL[reason]}`, finishedAt: new Date() },
  });
  if (count === 0) throw new HttpError(409, "This Pabili isn't being bought now.");
  await redis.del(locationKey(id));
  await notify(errand.residentId, { title: "Your Pabili couldn't be bought", body: `Nothing on your list could be bought at ${errand.shopName} (${NOT_BOUGHT_LABEL[reason]}). You pay nothing.`, link: `/resident/pabili/${id}` });
  await refundPabili(id, Number.MAX_SAFE_INTEGER, "Nothing on your list could be bought.");
  await broadcastErrand({ id, residentId: errand.residentId, status: "CANCELLED" });
  res.json({ ok: true });
});

const boughtSchema = z.object({
  receiptPhotoUrl: z.string("Take a photo of the receipt first.").regex(UPLOADED_PHOTO, "Take a photo of the receipt first."),
  itemsPhotoUrl: z.string("Take a photo of what you bought, at the shop.").regex(UPLOADED_PHOTO, "Take a photo of what you bought, at the shop."),
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
    select: { budget: true, residentId: true, deliveryFee: true, feeMax: true, deliveryLat: true, deliveryLng: true, extraFee: true, feastoCutRate: true, items: true, prepaid: true, paymentStatus: true },
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
    const withExtra = quote.fee + Number(errand.extraFee);
    fee = Math.min(withExtra, Number(errand.feeMax ?? withExtra));
  }

  // A receipt well above what the resident expected (for what was bought) is pointed out to them
  const priceFlag = priceFlagFor(input.receiptTotal, estimateOf(errand.items as PabiliItem[]));
  const { count } = await prisma.errand.updateMany({
    where: { id, riderId: userId, status: "ACCEPTED" },
    data: {
      status: "BOUGHT",
      boughtAt: new Date(),
      receiptTotal: input.receiptTotal,
      receiptPhotoUrl: input.receiptPhotoUrl,
      itemsPhotoUrl: input.itemsPhotoUrl,
      priceFlag,
      deliveryFee: fee,
      feastoCut: pabiliCut(fee, Number(errand.extraFee), Number(errand.feastoCutRate)),
      ...(at && { shopLat: at.lat, shopLng: at.lng }),
    },
  });
  if (count === 0) throw new HttpError(409, "This Pabili isn't waiting to be bought anymore. Refresh to see the latest.");
  const total = peso(input.receiptTotal + fee);
  await notify(errand.residentId, {
    title: "Your Pabili was bought",
    body: errand.prepaid
      ? `The receipt says ₱${peso(input.receiptTotal)}, and the delivery fee is ₱${peso(fee)}. It's paid online: nothing to pay at the door.${priceFlag ? ` ${priceFlag}` : ""}`
      : `The receipt says ₱${peso(input.receiptTotal)}, and the delivery fee is ₱${peso(fee)}${at ? ", from where the rider bought to you" : ""}. Have ₱${total} ready in cash.${priceFlag ? ` ${priceFlag}` : ""}`,
    link: `/resident/pabili/${id}`,
  });
  // Paid online first: what wasn't used comes back now
  if (errand.prepaid) {
    const paid = prepaidAmount(errand);
    await refundPabili(id, Math.round((paid - input.receiptTotal - fee) * 100) / 100, `Your Pabili cost ₱${total} (receipt and fee) of the ₱${peso(paid)} you paid.`);
  }
  await endRide(id);
  await broadcastErrand({ id, residentId: errand.residentId, status: "BOUGHT" });
  res.json({ ok: true, fee: peso(fee), collect: errand.prepaid ? "0.00" : total, prepaid: errand.prepaid, fromGps: Boolean(at) });
});

riderErrandsRouter.post("/errands/:id/delivered", async (req, res) => {
  const id = String(req.params.id);
  const userId = req.session!.userId;
  const { photoUrl, idChecked } = parseBody(
    z.object({ photoUrl: z.string("Take a photo of the handed-over items first.").regex(UPLOADED_PHOTO, "Take a photo of the handed-over items first."), idChecked: z.boolean().optional() }),
    req.body,
  );
  const errand = await prisma.errand.findFirst({ where: { id, riderId: userId }, select: { residentId: true, receiptTotal: true, deliveryFee: true, feastoCut: true, adultCheck: true, items: true, prepaid: true } });
  if (!errand) throw new HttpError(404, "We couldn't find this Pabili.");
  // Alcohol or cigarettes bought: the rider looks at the ID at the door, as the law asks
  const adultBought = errand.adultCheck && (errand.items as (PabiliItem & { flags?: string[] })[]).some((i) => !i.notBought && (i.flags ?? []).some((f) => f === "ALCOHOL" || f === "TOBACCO"));
  if (adultBought && !idChecked) throw new HttpError(400, "Check the customer's ID first: alcohol and cigarettes are only for 18 and older.");
  const { count } = await prisma.errand.updateMany({
    where: { id, riderId: userId, status: "BOUGHT" },
    data: { status: "DELIVERED", finishedAt: new Date(), deliveryPhotoUrl: photoUrl, ...(adultBought && { idCheckedAt: new Date() }) },
  });
  if (count === 0) throw new HttpError(409, "Upload the receipt first, then finish the delivery.");
  // Paid online first: Feasto pays the rider back what they spent, with their fee
  const paidBack = errand.prepaid ? await prisma.$transaction((tx) => payRiderBack(tx, id)) : null;
  await redis.del(locationKey(id));
  await endRide(id, { forget: true });
  await notify(errand.residentId, { title: "Your Pabili arrived", body: "Thanks for using Feasto Pabili!", link: `/resident/pabili/${id}` });
  await broadcastErrand({ id, residentId: errand.residentId, status: "DELIVERED" });
  res.json({
    ok: true,
    earned: peso(Number(errand.deliveryFee) - Number(errand.feastoCut)),
    feastoCut: peso(errand.feastoCut),
    collect: errand.prepaid ? "0.00" : peso(Number(errand.receiptTotal ?? 0) + Number(errand.deliveryFee)),
    paidBack: paidBack == null ? null : peso(paidBack),
  });
});

/**
 * The rider's live position for a Pabili, sent like a delivery's (rider.ts /location hands Pabili
 * ids here): kept in Redis and pushed to the resident's open page through Redis pub/sub.
 */
export async function shareErrandLocation(userId: string, errandId: string, lat: number, lng: number, demo = false) {
  const errand = await prisma.errand.findFirst({
    where: { id: errandId, riderId: userId, status: { in: ["ACCEPTED", "BOUGHT"] } },
    select: { residentId: true, status: true, deliveryLat: true, deliveryLng: true },
  });
  if (!errand) return false;
  // Daloy: the ride to the shop (no pin, so it ends when the items are bought), then to the door
  const toDoor = errand.status === "BOUGHT";
  await Promise.all([
    recordPosition(
      {
        id: errandId,
        kind: "ERRAND",
        leg: toDoor ? "TO_DOOR" : "TO_SHOP",
        riderId: userId,
        destination: toDoor && errand.deliveryLat != null && errand.deliveryLng != null ? { lat: errand.deliveryLat, lng: errand.deliveryLng } : null,
        pricedKm: null,
      },
      { lat, lng },
      demo,
    ),
    saveRiderPosition(userId, lat, lng),
  ]);
  const at = new Date().toISOString();
  await redis.set(locationKey(errandId), marshal({ lat, lng, at }, { transport: "redis", channel: locationKey(errandId), kind: "rider location" }), "EX", 3600);
  await publish(CHANNELS.user(errand.residentId), { type: "rider.location", orderId: errandId, lat, lng, at });
  return true;
}
