import type { JobDispatch, OrderStatus, Prisma } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { broadcastOrder, orderCode } from "./orders.js";
import { notify } from "./liveUpdates.js";
import { redis } from "./redis.js";
import { getSettings, type Settings } from "./settings.js";

/** Statuses where a delivery order can be taken by a rider (store accepted it, nobody took it yet). */
export const OPEN_JOB: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY"];
/** Statuses where a rider is busy with an order. */
export const BUSY: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"];

const FIRST_WAVE = 3;
const SECOND_WAVE = 5;
/** A phone that hasn't reported for this long may have closed the app or lost signal. */
const POSITION_FRESH_MS = 2 * 60_000;
const SEARCH_RADIUS_KM = 100;

// ---------- Where the riders are ----------

/** Riders' last positions, in a Redis geo index that all API copies and workers share. */
const POSITIONS = "riders:positions";
const POSITION_TIMES = "riders:positions:at";

export async function saveRiderPosition(userId: string, lat: number, lng: number) {
  await redis.pipeline().geoadd(POSITIONS, lng, lat, userId).hset(POSITION_TIMES, userId, Date.now()).exec();
}

export async function forgetRiderPosition(userId: string) {
  await redis.pipeline().zrem(POSITIONS, userId).hdel(POSITION_TIMES, userId).exec();
}

/**
 * The `count` riders nearest the spot, out of `candidates`. Riders with no recent position
 * aren't included: they get the job in the last step, when it opens to every free rider.
 */
async function nearestRiders(at: { lat: number; lng: number }, candidates: Set<string>, count: number) {
  if (candidates.size === 0) return [];
  const byDistance = (await redis.geosearch(POSITIONS, "FROMLONLAT", at.lng, at.lat, "BYRADIUS", SEARCH_RADIUS_KM, "km", "ASC")) as string[];
  const eligible = byDistance.filter((id) => candidates.has(id));
  if (eligible.length === 0) return [];
  const times = await redis.hmget(POSITION_TIMES, ...eligible);
  const oldest = Date.now() - POSITION_FRESH_MS;
  return eligible.filter((_, i) => Number(times[i] ?? 0) >= oldest).slice(0, count);
}

// ---------- Who may see a job ----------

/**
 * The rule behind the job list and the Accept button. A store's riders see only their own
 * store's jobs, from the start. Free riders see a job once it has reached them.
 */
export const jobVisibleTo = (rider: { userId: string; vendorId: string | null }): Prisma.OrderWhereInput =>
  rider.vendorId ? { vendorId: rider.vendorId } : { OR: [{ dispatch: "EVERYONE" }, { offers: { some: { riderId: rider.userId } } }] };

// ---------- Spreading a job, step by step ----------

/** Riders who could take a job right now: online, allowed to work, and not on a delivery. */
export const availableRider = (where: Prisma.RiderProfileWhereInput, user: Prisma.UserWhereInput = {}): Prisma.RiderProfileWhereInput => ({
  ...where,
  status: "APPROVED",
  isOnline: true,
  user: { ...user, disabledAt: null, deliveries: { none: { status: { in: BUSY } } } },
});

type Tx = Prisma.TransactionClient;
type Advance = { orderId: string; storeName: string; stage: JobDispatch; offeredTo: string[] };

/** Gives the job to the nearest free riders it hasn't reached yet. Empty if there are none. */
async function offerToNearest(tx: Tx, order: { id: string; vendor: { latitude: number | null; longitude: number | null } }, count: number) {
  const { latitude: lat, longitude: lng } = order.vendor;
  if (lat === null || lng === null) return [];
  const free = await tx.riderProfile.findMany({
    where: availableRider({ vendorId: null }, { jobOffers: { none: { orderId: order.id } } }),
    select: { userId: true },
  });
  const riders = await nearestRiders({ lat, lng }, new Set(free.map((r) => r.userId)), count);
  if (riders.length) await tx.jobOffer.createMany({ data: riders.map((riderId) => ({ orderId: order.id, riderId })) });
  return riders;
}

/**
 * Moves one job to its next step, with the waiting times from the admin's settings:
 *   the store's riders first (a minute by default);
 *   then the 3 free riders nearest the store;
 *   after the wait between waves (30 seconds by default), the next 5;
 *   after another wait, every free rider.
 * A step that would reach nobody is skipped, so nobody waits for riders who aren't there.
 */
async function advance(tx: Tx, id: string, settings: Settings): Promise<Advance | null> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id },
    select: { id: true, status: true, riderId: true, dispatch: true, vendorId: true, vendor: { select: { name: true, latitude: true, longitude: true } } },
  });
  // Taken or cancelled in the meantime: nothing more to do
  if (order.riderId || !OPEN_JOB.includes(order.status)) {
    await tx.order.update({ where: { id }, data: { nextDispatchAt: null } });
    return null;
  }

  const moveTo = async (stage: JobDispatch, waitMs: number | null, offeredTo: string[]) => {
    await tx.order.update({ where: { id }, data: { dispatch: stage, nextDispatchAt: waitMs === null ? null : new Date(Date.now() + waitMs) } });
    return { orderId: id, storeName: order.vendor.name, stage, offeredTo };
  };

  if (order.dispatch === "NEW") {
    const own = await tx.riderProfile.findMany({ where: availableRider({ vendorId: order.vendorId }), select: { userId: true } });
    if (own.length) return moveTo("STORE_RIDERS", settings.storeRiderSeconds * 1000, own.map((r) => r.userId));
  }
  if (order.dispatch === "NEW" || order.dispatch === "STORE_RIDERS") {
    const riders = await offerToNearest(tx, order, FIRST_WAVE);
    if (riders.length) return moveTo("NEAREST", settings.riderWaveSeconds * 1000, riders);
  }
  if (order.dispatch !== "WIDER") {
    const riders = await offerToNearest(tx, order, SECOND_WAVE);
    if (riders.length) return moveTo("WIDER", settings.riderWaveSeconds * 1000, riders);
  }
  // The last stage: the job is in every free rider's list. Tell the ones it hasn't reached yet, so
  // a rider with Feasto closed hears about it too (once: this is the final step).
  const rest = await tx.riderProfile.findMany({
    // Freelance riders only: a store's own riders only ever see that store's jobs
    where: availableRider({ vendorId: null }, { jobOffers: { none: { orderId: id } } }),
    select: { userId: true },
    take: 100,
  });
  return moveTo("EVERYONE", null, rest.map((r) => r.userId));
}

/**
 * Runs the steps that have come due. The time of each job's next step is in the database and
 * FOR UPDATE SKIP LOCKED gives each worker different jobs, so with several workers no step
 * runs twice, and if a worker dies another one carries on from where the job was.
 */
export async function runDueDispatches(log: (...args: unknown[]) => void, batchSize = 20) {
  // Most seconds nothing is due, so don't open a transaction just to find that out
  const anyDue = await prisma.order.findFirst({ where: { nextDispatchAt: { lte: new Date() } }, select: { id: true } });
  if (!anyDue) return;

  const settings = await getSettings();
  const moved = await prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order"
      WHERE "nextDispatchAt" <= NOW()
      ORDER BY "nextDispatchAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED`;
    const results: Advance[] = [];
    for (const { id } of due) {
      const result = await advance(tx, id, settings);
      if (result) results.push(result);
    }
    return results;
  });

  for (const { orderId, storeName, stage, offeredTo } of moved) {
    log(`job ${orderCode(orderId)} from ${storeName}: ${stage}, reached ${offeredTo.length} rider(s)`);
    await Promise.all(offeredTo.map((riderId) => notify(riderId, { title: "New delivery job", body: `Pick up at ${storeName}.`, link: "/rider" })));
    // Riders' job lists and the store's order board load again
    await broadcastOrder(orderId);
  }
}
