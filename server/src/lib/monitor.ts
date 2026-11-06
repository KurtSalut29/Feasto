import type { Prisma } from "../generated/prisma/client.js";
import { logActivity, notifyAdmin } from "./activity.js";
import { prisma } from "./db.js";
import { forgetRiderPosition, OPEN_JOB } from "./dispatch.js";
import { notify } from "./realtime.js";
import { redis } from "./redis.js";
import { daysFromToday, EXPIRING_SOON_DAYS, manilaToday } from "./renewals.js";
import { getSettings } from "./settings.js";

type Log = (...args: unknown[]) => void;

/** True once per key across all workers: Redis SET NX lets exactly one of them through. */
const firstToClaim = async (key: string, days: number) => (await redis.set(`monitor:${key}`, "1", "EX", days * 86400, "NX")) === "OK";

// ---------- Stuck orders ----------

/** A delivery that's been on the road this long has probably gone wrong. */
const ON_THE_ROAD_MINUTES = 60;

/** Orders that have waited too long for someone. Each kind of wait is explained by `whyStuck`. */
export function stuckOrdersWhere(stuckMinutes: number, now = Date.now()): Prisma.OrderWhereInput {
  const since = new Date(now - stuckMinutes * 60_000);
  return {
    OR: [
      { status: "PLACED", createdAt: { lt: since } },
      { fulfillment: "DELIVERY", riderId: null, status: { in: OPEN_JOB }, acceptedAt: { lt: since } },
      { fulfillment: "DELIVERY", riderId: { not: null }, status: "READY", readyAt: { lt: since } },
      { status: "PICKED_UP", pickedUpAt: { lt: new Date(now - ON_THE_ROAD_MINUTES * 60_000) } },
    ],
  };
}

type StuckFields = { status: string; riderId: string | null; createdAt: Date; acceptedAt: Date | null; readyAt: Date | null; pickedUpAt: Date | null };

export function whyStuck(order: StuckFields) {
  if (order.status === "PLACED") return { reason: "NO_STORE_REPLY", since: order.createdAt };
  if (order.status === "PICKED_UP") return { reason: "ON_THE_ROAD", since: order.pickedUpAt ?? order.createdAt };
  if (order.riderId) return { reason: "RIDER_NOT_COLLECTING", since: order.readyAt ?? order.createdAt };
  return { reason: "NO_RIDER", since: order.acceptedAt ?? order.createdAt };
}

/** Tells the admin about orders that newly got stuck, as one message instead of one per order. */
async function announceStuckOrders() {
  const { stuckMinutes } = await getSettings();
  const orders = await prisma.order.findMany({ where: stuckOrdersWhere(stuckMinutes), select: { id: true, status: true, riderId: true }, take: 200 });
  let fresh = 0;
  for (const order of orders) {
    if (await firstToClaim(`stuck:${order.id}:${order.status}:${order.riderId ?? "none"}`, 2)) fresh++;
  }
  if (fresh > 0) {
    await notifyAdmin({ title: `${fresh} ${fresh === 1 ? "order needs" : "orders need"} your attention`, body: "They've been waiting too long for a store or a rider.", link: "/admin/stuck" });
  }
  return fresh;
}

// ---------- Documents that expire ----------

/** How urgent a reminder is. A new stage means a new reminder; a renewed date starts over. */
const stageOf = (daysLeft: number) => (daysLeft < 0 ? "expired" : daysLeft <= 7 ? "7-days" : "30-days");

const daysUntil = (date: Date) => Math.round((date.getTime() - manilaToday().getTime()) / 86400_000);

const inWords = (daysLeft: number) => (daysLeft < 0 ? "has expired" : daysLeft === 0 ? "expires today" : `expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`);

/** A rider can't work on an expired license. A delivery already under way can still finish. */
async function takeExpiredRidersOffline(log: Log) {
  // UPDATE ... RETURNING hands each rider to one worker only
  const today = manilaToday().toISOString().slice(0, 10);
  const riders = await prisma.$queryRaw<{ userId: string }[]>`
    UPDATE "RiderProfile" SET "isOnline" = false
    WHERE "isOnline" AND "licenseExpiresAt" < ${today}::date
    RETURNING "userId"`;
  for (const { userId } of riders) {
    await forgetRiderPosition(userId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    await logActivity(prisma, null, { category: "DOCUMENTS", action: "Took rider offline: license expired", target: user.name });
    log(`${user.name} went offline: license expired`);
  }
}

async function remindStores() {
  const stores = await prisma.vendor.findMany({
    where: { status: "APPROVED", permitExpiresAt: { lte: daysFromToday(EXPIRING_SOON_DAYS) } },
    select: { id: true, name: true, ownerId: true, permitExpiresAt: true },
  });
  for (const store of stores) {
    const daysLeft = daysUntil(store.permitExpiresAt!);
    const key = `expiry:store:${store.id}:${store.permitExpiresAt!.toISOString().slice(0, 10)}:${stageOf(daysLeft)}`;
    if (!(await firstToClaim(key, EXPIRING_SOON_DAYS + 10))) continue;
    await notify(store.ownerId, {
      title: `Your business permit ${inWords(daysLeft)}`,
      body: daysLeft < 0 ? "Upload your renewed permit so Feasto can keep your store open." : "Upload your renewed permit before it expires.",
      link: "/vendor/store#permit",
    });
    if (daysLeft < 0) await notifyAdmin({ title: `${store.name}'s business permit has expired`, body: "Check whether a renewal came in, or suspend the store.", link: "/admin/documents?view=expired&kind=stores" });
  }
}

async function remindRiders() {
  const riders = await prisma.riderProfile.findMany({
    where: { status: "APPROVED", licenseExpiresAt: { lte: daysFromToday(EXPIRING_SOON_DAYS) } },
    select: { id: true, userId: true, licenseExpiresAt: true, user: { select: { name: true } }, vendor: { select: { ownerId: true } } },
  });
  for (const rider of riders) {
    const daysLeft = daysUntil(rider.licenseExpiresAt!);
    const key = `expiry:rider:${rider.id}:${rider.licenseExpiresAt!.toISOString().slice(0, 10)}:${stageOf(daysLeft)}`;
    if (!(await firstToClaim(key, EXPIRING_SOON_DAYS + 10))) continue;
    await notify(rider.userId, {
      title: `Your driver's license ${inWords(daysLeft)}`,
      body: daysLeft < 0 ? "You can't go online until your renewed license is approved." : "Upload your renewed license before it expires.",
      link: "/rider/license",
    });
    if (daysLeft < 0 && rider.vendor) await notify(rider.vendor.ownerId, { title: `${rider.user.name}'s license has expired`, body: "They can't take jobs until you approve a renewed license.", link: "/vendor/riders" });
  }
}

/** Every worker runs this each minute. Each reminder or action still happens only once. */
export async function runMonitors(log: Log) {
  await takeExpiredRidersOffline(log);
  await remindStores();
  await remindRiders();
  const fresh = await announceStuckOrders();
  if (fresh) log(`${fresh} order(s) newly stuck, told the admin`);
}
