// Gives the Naval stores a past: 30 days of finished orders, ratings and reviews, so sales,
// reports, best sellers and "Top rated" have something to show before real people order.
//
// It only ADDS data. Nothing real is touched: the orders belong to sample residents and riders
// whose emails end in @sample.feasto.com. Running it again first removes the previous sample
// history (and only that), so it can be refreshed any time.
//
// Run:  docker compose --profile tools run --rm --build history
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import type { Fulfillment, MenuItem, OnlinePayment, OrderStatus, PaymentMethod, StoreType, User, Vendor } from "./generated/prisma/client.js";
import { hashPassword } from "./lib/auth.js";
import { priceDelivery } from "./lib/deliveryFee.js";
import { feastoShare } from "./lib/earnings.js";
import { distanceKm } from "./lib/geo.js";
import { prisma } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { DEFAULT_SETTINGS } from "./lib/settings.js";
import { RIDER_ISSUES, RIDER_PRAISE } from "./lib/riderRatings.js";

const DAYS = 30;
const DOMAIN = "@sample.feasto.com";
const PASSWORD = "demo1234";
/** Marks the weekly settlements this script makes, so a new run removes only those */
const SAMPLE_SETTLEMENT = "Weekly settlement (sample history)";
const DOCUMENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo", "documents");

// Same "random" data every run
let seed = 20261112;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (p: number) => random() < p;
const minutes = (n: number) => n * 60_000;

const PH_OFFSET = 8 * 3600_000;
function manilaAt(daysAgo: number, minuteOfDay: number) {
  const day = new Date(Date.now() + PH_OFFSET - daysAgo * 86400_000).toISOString().slice(0, 10);
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return new Date(`${day}T${hh}:${mm}:00+08:00`);
}
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const phone = () => `09${pick(["17", "18", "19", "20", "27", "45", "56", "66", "77", "95"])}${String(between(1000000, 9999999))}`;

// ---------- Sample people ----------

const BARANGAYS: { name: string; lat: number; lng: number }[] = [
  { name: "Brgy. Caraycaray", lat: 11.5548, lng: 124.3982 },
  { name: "Brgy. Atipolo", lat: 11.5712, lng: 124.4011 },
  { name: "Brgy. Calumpang", lat: 11.5655, lng: 124.3921 },
  { name: "Brgy. Santissimo Rosario", lat: 11.5627, lng: 124.3958 },
  { name: "Brgy. Santo Niño", lat: 11.5596, lng: 124.3989 },
  { name: "Brgy. P.I. Garcia", lat: 11.5581, lng: 124.3941 },
  { name: "Brgy. Larrazabal", lat: 11.5668, lng: 124.3995 },
  { name: "Brgy. Capiñahan", lat: 11.5519, lng: 124.3933 },
  { name: "Brgy. Libertad", lat: 11.5742, lng: 124.3972 },
  { name: "Brgy. Agpangi", lat: 11.5479, lng: 124.4021 },
];
const STREETS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5", "Vicentillo Street", "Castin Street", "Inocentes Street", "Ballesteros Street", "Real Street"];

const RESIDENTS = [
  "Angelica Reyes", "Mark Anthony Cruz", "Kimberly Santos", "John Paul Garcia", "Princess Mendoza",
  "Christian Villanueva", "Jasmine Bautista", "Rhea Mae Aquino", "Kevin Ramos", "Shiela Marie Flores",
  "Jerome Navarro", "Mae Ann Castillo", "Joshua Fernandez", "Kristine Joy Lim", "Rodel Pascual",
  "Hazel Ann Torres", "Bryan Dela Rosa", "Camille Gonzales", "Ronald Morales", "Lovely Grace Tan",
  "Jericho Salazar", "Divine Ocampo", "Aldrin Manalo", "Joanna Rivera",
];
const RIDERS = [
  { name: "Ramil Abella", vehicle: "Honda Click 125", plate: "NBA 4021" },
  { name: "Dennis Sabado", vehicle: "Yamaha Mio i125", plate: "NBC 7713" },
  { name: "Arnel Pacquiao", vehicle: "Suzuki Raider 150", plate: "NBD 2290" },
  { name: "Joel Tapales", vehicle: "Honda TMX 125", plate: "NBE 5168" },
  { name: "Ryan Bacolod", vehicle: "Kawasaki Barako 175", plate: "NBF 3307" },
  { name: "Noel Esguerra", vehicle: "Honda XRM 125", plate: "NBG 8845" },
];
const emailOf = (name: string) => `${name.toLowerCase().replace(/ /g, ".").replace(/[^a-z.]/g, "")}${DOMAIN}`;

const COMMENTS: Record<number, string[]> = {
  5: ["Sobrang sarap! Will order again.", "Mainit pa pagdating. Perfect!", "Sulit na sulit, ang laki ng serving.", "Best in Naval talaga.", "Lasang lutong bahay.", "Ang bilis ng delivery, salamat!", "Fresh and masarap, 10/10."],
  4: ["Masarap, medyo natagalan lang.", "Good food, fair price.", "Solid! Sana may extra sauce.", "Okay ang lasa, packaging could be better."],
  3: ["Okay lang, medyo maalat today.", "Food was fine but arrived lukewarm."],
  2: ["Mas maliit ang serving kaysa dati."],
  1: ["Mali ang order na dumating."],
};
/** What residents tap and write about the rider */
const RIDER_COMMENTS: Record<number, string[]> = {
  5: ["Salamat kuya, ingat po!", "Ang bilis, mainit pa ang pagkain.", "Very polite, tumawag pa bago dumating.", "Sinundan ang note ko. Thank you!"],
  4: ["Okay naman, medyo natagalan lang sa traffic.", "Mabait si kuya."],
  3: ["Medyo late, pero okay pa rin ang pagkain."],
  2: ["Hindi agad nahanap ang bahay."],
  1: ["Natapon ang sabaw."],
};
const pickTags = (rating: number) => {
  const tags = rating >= 4 ? [...RIDER_PRAISE] : [...RIDER_ISSUES];
  return tags.filter(() => chance(rating >= 4 ? 0.35 : 0.3)).slice(0, 3);
};

function weightedRating() {
  const r = random();
  return r < 0.58 ? 5 : r < 0.88 ? 4 : r < 0.96 ? 3 : r < 0.99 ? 2 : 1;
}

/** Busier kinds of stores get more orders */
const POPULARITY: Record<StoreType, [number, number]> = {
  FAST_FOOD: [4, 6],
  MILK_TEA_DRINKS: [3, 5],
  CARINDERIA: [3, 5],
  SNACKS_STREET_FOOD: [2, 4],
  RESTAURANT: [2, 4],
  CAFE: [2, 3],
  BAKERY: [2, 3],
  DESSERTS: [1, 3],
  HOME_KITCHEN: [1, 3],
};

/** Order times cluster around lunch and dinner, like real food orders */
const HOUR_WEIGHTS: Record<number, number> = { 6: 1, 7: 2, 8: 2, 9: 2, 10: 3, 11: 6, 12: 8, 13: 5, 14: 3, 15: 4, 16: 4, 17: 6, 18: 8, 19: 7, 20: 4, 21: 2, 22: 1, 23: 1 };

function orderMinute(open: number, close: number) {
  const hours = Object.entries(HOUR_WEIGHTS)
    .map(([h, w]) => ({ start: Number(h) * 60, w }))
    .filter(({ start }) => start + 59 >= open + 10 && start <= close - 20);
  if (!hours.length) return null;
  const total = hours.reduce((n, h) => n + h.w, 0);
  let roll = random() * total;
  for (const h of hours) {
    roll -= h.w;
    if (roll <= 0) return Math.min(Math.max(h.start + between(0, 59), open + 10), close - 20);
  }
  return null;
}

// ---------- Remove the previous sample history ----------

async function removeSamples() {
  const people = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = people.map((p) => p.id);
  if (!ids.length) return 0;
  const orders = await prisma.order.findMany({ where: { checkout: { residentId: { in: ids } } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const licenses = await prisma.riderProfile.findMany({ where: { userId: { in: ids }, licenseFile: { not: null } }, select: { licenseFile: true } });
  await prisma.$transaction([
    prisma.settlement.deleteMany({ where: { OR: [{ note: SAMPLE_SETTLEMENT }, { riderId: { in: ids } }] } }),
    // A real order a sample rider was offered or carried keeps existing, just without that rider
    prisma.order.updateMany({ where: { riderId: { in: ids }, id: { notIn: orderIds } }, data: { riderId: null } }),
    prisma.jobOffer.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { riderId: { in: ids } }] } }),
    prisma.review.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { residentId: { in: ids } }] } }),
    prisma.riderRating.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { residentId: { in: ids } }, { riderId: { in: ids } }] } }),
    prisma.payout.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { riderId: { in: ids } }] } }),
    prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
    prisma.checkout.deleteMany({ where: { residentId: { in: ids } } }),
    prisma.booking.deleteMany({ where: { residentId: { in: ids } } }),
    prisma.notification.deleteMany({ where: { userId: { in: ids } } }),
    prisma.favorite.deleteMany({ where: { userId: { in: ids } } }),
    prisma.address.deleteMany({ where: { userId: { in: ids } } }),
    prisma.documentRenewal.deleteMany({ where: { rider: { userId: { in: ids } } } }),
    prisma.riderProfile.deleteMany({ where: { userId: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);
  for (const { licenseFile } of licenses) await rm(path.join(config.documentDir, licenseFile!), { force: true });
  return orderIds.length;
}

async function sampleLicense() {
  await mkdir(config.documentDir, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}.png`;
  await copyFile(path.join(DOCUMENT_DIR, "sample-license.png"), path.join(config.documentDir, name));
  return name;
}

// ---------- Main ----------

async function main() {
  const removed = await removeSamples();
  if (removed) console.log(`Removed the previous sample history (${removed} orders).`);

  const vendors = await prisma.vendor.findMany({
    where: { status: "APPROVED" },
    include: { menuItems: { where: { deletedAt: null, isAvailable: true } } },
    orderBy: { name: "asc" },
  });
  const stores = vendors.filter((v) => v.menuItems.length > 0);
  if (!stores.length) throw new Error("No approved stores with dishes. Run the naval seed first.");

  const passwordHash = await hashPassword(PASSWORD);
  const since = manilaAt(DAYS + 5, 9 * 60);

  console.log(`Creating ${RESIDENTS.length} sample residents and ${RIDERS.length} sample riders…`);
  const residents: { user: User; address: string; lat: number; lng: number }[] = [];
  for (const [i, name] of RESIDENTS.entries()) {
    const brgy = BARANGAYS[i % BARANGAYS.length];
    const lat = brgy.lat + (random() - 0.5) * 0.004;
    const lng = brgy.lng + (random() - 0.5) * 0.004;
    const address = `${pick(STREETS)}, ${brgy.name}, Naval, Biliran`;
    const user = await prisma.user.create({
      data: {
        email: emailOf(name),
        name,
        phone: phone(),
        role: "RESIDENT",
        passwordHash,
        createdAt: new Date(since.getTime() + i * 3 * 3600_000),
        addresses: { create: { label: "Home", details: address, latitude: lat, longitude: lng, isDefault: true } },
      },
    });
    residents.push({ user, address, lat, lng });
  }

  const riders: User[] = [];
  for (const [i, r] of RIDERS.entries()) {
    riders.push(
      await prisma.user.create({
        data: {
          email: emailOf(r.name),
          name: r.name,
          phone: phone(),
          role: "RIDER",
          passwordHash,
          createdAt: new Date(since.getTime() + i * 5 * 3600_000),
          riderProfile: {
            create: {
              vehicleModel: r.vehicle,
              plateNumber: r.plate,
              licenseNumber: `N07-2${i}-${String(400100 + i * 1371)}`,
              licenseExpiresAt: new Date("2028-12-31"),
              licenseFile: await sampleLicense(),
              birthDate: new Date(`${1990 + i}-06-1${i}`),
              address: `${pick(STREETS)}, ${pick(BARANGAYS).name}, Naval, Biliran`,
              emergencyName: "Maria Santos",
              emergencyPhone: phone(),
              status: "APPROVED",
              reviewedAt: since,
              isOnline: false, // never offered tomorrow's real jobs
            },
          },
        },
      }),
    );
  }

  // How many orders each store gets per day, on average
  const perDay = new Map(stores.map((s) => [s.id, (between(...POPULARITY[s.storeType]) * (0.8 + random() * 0.4)) / 3]));
  const nowMinute = toMinutes(new Date(Date.now() + PH_OFFSET).toISOString().slice(11, 16));

  console.log(`Creating ${DAYS} days of orders for ${stores.length} stores…`);
  let orders = 0;
  let reviews = 0;
  let riderRatings = 0;
  let key = 0;
  const batch = randomBytes(4).toString("hex");

  // What each store and sample rider owes Feasto from cash orders since the last Monday (online
  // orders were split when delivered). Every Monday morning the admin collects it, so only this
  // week's cash is still owed.
  const owed = new Map<string, { vendorId?: string; riderId?: string; amount: number; orders: number }>();
  const add = (key: string, party: { vendorId?: string; riderId?: string }, amount: number) => {
    const row = owed.get(key) ?? { ...party, amount: 0, orders: 0 };
    row.amount += amount;
    row.orders += 1;
    owed.set(key, row);
  };
  let settlements = 0;
  async function settleWeek(at: Date) {
    const rows = [...owed.values()].filter((r) => r.amount > 0);
    await prisma.settlement.createMany({
      data: rows.map((r) => ({ r, method: chance(0.75) ? pick(["GCASH", "GCASH", "GCASH", "MAYA"] as const) : null })).map(({ r, method }) => ({
        vendorId: r.vendorId ?? null,
        riderId: r.riderId ?? null,
        amount: Math.round(r.amount * 100) / 100,
        orders: r.orders,
        // Most pay in the app; a few hand the cash to the admin
        method,
        settledByName: method ? "Paid in the app" : "Feasto admin",
        note: SAMPLE_SETTLEMENT,
        createdAt: at,
      })),
    });
    settlements += rows.length;
    owed.clear();
  }

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    const weekday = new Date(Date.now() + PH_OFFSET - daysAgo * 86400_000).getUTCDay();
    if (weekday === 1 && daysAgo > 0 && daysAgo < DAYS) await settleWeek(manilaAt(daysAgo, 6 * 60));
    const busy = weekday === 0 || weekday === 5 || weekday === 6 ? 1.35 : 1;
    // Slowly growing: the first weeks are quieter than the last
    const growth = 0.75 + 0.35 * ((DAYS - daysAgo) / DAYS);

    for (const store of stores) {
      const open = toMinutes(store.opensAt);
      let close = toMinutes(store.closesAt);
      if (close <= open) close = 24 * 60 - 1; // open past midnight: count it until 23:59
      if (daysAgo === 0) close = Math.min(close, nowMinute - 70); // today: only orders already finished
      if (close <= open + 30) continue;

      const expected = perDay.get(store.id)! * busy * growth;
      const count = Math.floor(expected) + (chance(expected % 1) ? 1 : 0);
      for (let n = 0; n < count; n++) {
        const minute = orderMinute(open, close);
        if (minute === null) continue;
        await createOrder(store, pick(residents), manilaAt(daysAgo, minute));
      }
    }
  }

  async function createOrder(store: Vendor & { menuItems: MenuItem[] }, resident: (typeof residents)[number], createdAt: Date) {
    const roll = random();
    const failedAs: OrderStatus | null = roll < 0.05 ? "CANCELLED" : roll < 0.09 ? "REJECTED" : null;
    const fulfillment: Fulfillment = chance(0.72) ? "DELIVERY" : "PICKUP";
    const status: OrderStatus = failedAs ?? (fulfillment === "DELIVERY" ? "DELIVERED" : "COMPLETED");
    const failed = failedAs !== null;
    const paymentMethod: PaymentMethod = store.acceptsCash && chance(0.6) ? "COD" : "ONLINE";
    const onlineMethod: OnlinePayment | null =
      paymentMethod === "ONLINE" ? (store.onlinePayments.length ? pick(weightedOnline(store.onlinePayments)) : "GCASH") : null;

    // A few dishes, favoring the first ones on the menu (usually the store's best known)
    const menu = store.menuItems;
    const lineCount = between(1, Math.min(3, menu.length));
    const chosen = new Set<MenuItem>();
    while (chosen.size < lineCount) chosen.add(menu[Math.floor(Math.pow(random(), 1.6) * menu.length)]);
    let lines = [...chosen].map((item) => ({ item, quantity: quantityFor(Number(item.price)) }));
    // A whole cake or a party pizza is usually the whole order
    if (lines.length > 1 && lines.some((l) => Number(l.item.price) >= 700)) lines = [lines.find((l) => Number(l.item.price) >= 700)!];
    const subtotal = lines.reduce((n, l) => n + Number(l.item.price) * l.quantity, 0);

    const km =
      store.latitude != null && store.longitude != null
        ? Math.round(distanceKm({ lat: store.latitude, lng: store.longitude }, { lat: resident.lat, lng: resident.lng }) * 1.3 * 10) / 10
        : null;
    const deliveryFee = fulfillment === "DELIVERY" ? priceDelivery(km, DEFAULT_SETTINGS, createdAt).fee : 0;
    const rider = fulfillment === "DELIVERY" && !failed ? pick(riders) : null;
    const at = (m: number) => new Date(createdAt.getTime() + minutes(m));
    const ready = between(12, 25);
    // About half the deliveries get the rider rated, and some of those a tip (paid online)
    const riderStars = rider && chance(0.5) ? weightedRating() : null;
    const tip = riderStars !== null && riderStars >= 4 && chance(0.3) ? pick([10, 20, 20, 20, 30, 50, 50, 100]) : 0;
    const share = feastoShare({ fulfillment, subtotal, deliveryFee, commissionFreeUntil: store.commissionFreeUntil }, DEFAULT_SETTINGS, createdAt);
    if (!failed && paymentMethod === "COD") {
      add(store.id, { vendorId: store.id }, share.commission);
      if (rider) add(rider.id, { riderId: rider.id }, share.riderCut);
    }

    const checkout = await prisma.checkout.create({
      data: {
        residentId: resident.user.id,
        fulfillment,
        paymentMethod,
        onlineMethod,
        total: subtotal + deliveryFee,
        paymentStatus: paymentMethod === "ONLINE" ? (failed ? "REFUNDED" : "PAID") : failed ? "PENDING" : "PAID",
        idempotencyKey: `history-${batch}-${++key}`,
        deliveryAddress: fulfillment === "DELIVERY" ? resident.address : null,
        deliveryLat: fulfillment === "DELIVERY" ? resident.lat : null,
        deliveryLng: fulfillment === "DELIVERY" ? resident.lng : null,
        notes: chance(0.12) ? pick(["Less spicy please.", "Pakidagdagan ng sauce.", "No onions.", "Please call when outside.", "Extra rice po."]) : null,
        createdAt,
      },
    });
    const order = await prisma.order.create({
      data: {
        checkoutId: checkout.id,
        vendorId: store.id,
        riderId: rider?.id ?? null,
        status,
        fulfillment,
        subtotal,
        deliveryFee,
        deliveryKm: fulfillment === "DELIVERY" ? km : null,
        ...share,
        tip,
        tipMethod: tip ? (onlineMethod ?? pick(["GCASH", "GCASH", "MAYA"] as const)) : null,
        rejectReason: status === "REJECTED" ? pick(["Sold out for today.", "Kitchen is closing early.", "Too many orders right now."]) : status === "CANCELLED" ? "Cancelled by the resident" : null,
        acceptedAt: status === "REJECTED" ? null : failed ? null : at(between(1, 4)),
        readyAt: failed ? null : at(ready),
        pickedUpAt: rider ? at(ready + between(3, 8)) : null,
        finishedAt: at(failed ? between(2, 6) : ready + between(15, 30)),
        createdAt,
        placedAt: createdAt,
        items: { create: lines.map((l) => ({ menuItemId: l.item.id, name: l.item.name, unitPrice: l.item.price, quantity: l.quantity })) },
      },
    });
    orders++;

    if (!failed && chance(0.62)) {
      const rating = weightedRating();
      await prisma.review.create({
        data: {
          orderId: order.id,
          vendorId: store.id,
          residentId: resident.user.id,
          rating,
          comment: chance(0.55) ? pick(COMMENTS[rating]) : null,
          createdAt: at(between(70, 400)),
        },
      });
      reviews++;
    }
    if (rider && riderStars !== null) {
      await prisma.riderRating.create({
        data: {
          orderId: order.id,
          riderId: rider.id,
          residentId: resident.user.id,
          rating: riderStars,
          tags: pickTags(riderStars),
          comment: chance(0.3) ? pick(RIDER_COMMENTS[riderStars]) : null,
          createdAt: at(ready + between(40, 300)),
        },
      });
      riderRatings++;
    }
  }

  // Every store's stars from all its reviews (real ones included)
  const totals = await prisma.review.groupBy({ by: ["vendorId"], _sum: { rating: true }, _count: true });
  const byStore = new Map(totals.map((t) => [t.vendorId, t]));
  for (const v of vendors) {
    const t = byStore.get(v.id);
    await prisma.vendor.update({ where: { id: v.id }, data: { ratingSum: t?._sum.rating ?? 0, ratingCount: t?._count ?? 0 } });
  }

  // Every rider's stars, the same way
  const riderTotals = await prisma.riderRating.groupBy({ by: ["riderId"], _sum: { rating: true }, _count: true });
  for (const t of riderTotals) {
    await prisma.riderProfile.updateMany({ where: { userId: t.riderId }, data: { ratingSum: t._sum.rating ?? 0, ratingCount: t._count } });
  }

  // Store lists and pages are cached in Redis: drop them so the new numbers show right away
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "cache:*", "COUNT", 500);
    if (keys.length) await redis.del(...keys);
    cursor = next;
  } while (cursor !== "0");

  console.log(`Collected Feasto's share of cash orders each Monday (${settlements} sample settlements); this week's is still owed.`);
  const sales = await prisma.order.aggregate({ where: { status: { in: ["DELIVERED", "COMPLETED"] }, checkout: { resident: { email: { endsWith: DOMAIN } } } }, _sum: { subtotal: true } });
  console.log(`\nDone: ${orders} orders and ${reviews} reviews over ${DAYS} days, ₱${Number(sales._sum.subtotal ?? 0).toLocaleString("en-PH")} in sales.`);
  console.log(`Sample residents and riders log in with ${PASSWORD} (emails end in ${DOMAIN}).`);
}

/** How many of one dish people buy: ten pandesal, a couple of drinks, one cake */
function quantityFor(price: number) {
  if (price <= 15) return between(4, 15);
  if (price <= 40) return between(2, 6);
  if (price <= 90) return between(1, 3);
  if (price <= 300) return between(1, 2);
  return 1;
}

/** GCash and Maya are what most people in Naval pay with */
function weightedOnline(methods: OnlinePayment[]) {
  const weight: Partial<Record<OnlinePayment, number>> = { GCASH: 10, MAYA: 4, GRABPAY: 1, SHOPEEPAY: 1, VISA: 1, MASTERCARD: 1 };
  return methods.flatMap((m) => Array<OnlinePayment>(weight[m] ?? 0).fill(m)).concat(methods.includes("GCASH") ? [] : methods);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
  redis.disconnect();
}
