import { prisma } from "./db.js";
import { availableRider, nearestRiders, PREFERRED_RIDER_SECONDS, riderDistances } from "./dispatch.js";
import { HttpError } from "./http.js";
import { CHANNELS, notify, publish } from "./liveUpdates.js";
import { hasExpired } from "./renewals.js";
import { averageOf, shortName } from "./riderRatings.js";

/**
 * Pabili: a resident asks a rider to buy things at a shop that isn't on Feasto. The rider pays at
 * the shop and is paid back in cash on delivery (the receipt's total plus the delivery fee), so
 * the budget is capped to keep what a rider lends small.
 */
export const PABILI_BUDGET_MAX = 1000;
export const PABILI_BUDGET_MIN = 20;
/** A Pabili nobody takes in this long is cancelled, and the resident is told */
export const ERRAND_WAIT_MINUTES = 15;
/**
 * A Pabili shop has no map pin: the fee is worked out from where the rider buys (their phone's
 * spot) to the customer, and never goes above the fee for a shop this far by road.
 */
export const PABILI_MAX_KM = 5;
/** The middle of Naval, for an address without a pin */
const TOWN_CENTER = { lat: 11.5618, lng: 124.3965 };
/** How many free riders near the shop hear about a new Pabili */
const NEARBY_RIDERS = 10;

type Log = (...args: unknown[]) => void;

/**
 * The free riders a resident can ask for, nearest to a spot first: online, approved, not on a
 * job, with a valid license. Only what helps choose (first name and initial, rating, motorcycle,
 * how far, whether they've delivered to this resident before); never a phone number.
 */
export async function ridersToChoose(at: { lat: number; lng: number }, residentId: string) {
  const riders = await prisma.riderProfile.findMany({
    where: availableRider({ vendorId: null }),
    select: {
      userId: true,
      vehicleModel: true,
      licenseExpiresAt: true,
      ratingSum: true,
      ratingCount: true,
      user: { select: { name: true, _count: { select: { deliveries: { where: { status: "DELIVERED" } } } } } },
    },
    take: 200,
  });
  const usable = riders.filter((r) => !hasExpired(r.licenseExpiresAt));
  const [km, before] = await Promise.all([
    riderDistances(at, new Set(usable.map((r) => r.userId))),
    prisma.order.groupBy({
      by: ["riderId"],
      where: { status: "DELIVERED", riderId: { in: usable.map((r) => r.userId) }, checkout: { residentId } },
      _count: true,
    }),
  ]);
  const servedYou = new Set(before.map((b) => b.riderId));
  return usable
    .map((r) => ({
      id: r.userId,
      name: shortName(r.user.name),
      vehicle: r.vehicleModel,
      rating: averageOf(r.ratingSum, r.ratingCount),
      ratingCount: r.ratingCount,
      deliveries: r.user._count.deliveries,
      distanceKm: km.has(r.userId) ? Math.round(km.get(r.userId)! * 10) / 10 : null,
      servedYou: servedYou.has(r.userId),
    }))
    .sort((a, b) => Number(b.servedYou) - Number(a.servedYou) || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name))
    .slice(0, 30);
}

/** The rider a resident asked for, if they can take it right now; otherwise a reason to choose again. */
export async function chosenRider(riderId: string) {
  const rider = await prisma.riderProfile.findFirst({
    where: availableRider({ userId: riderId, vendorId: null }),
    select: { userId: true, licenseExpiresAt: true, user: { select: { name: true } } },
  });
  if (!rider || hasExpired(rider.licenseExpiresAt)) {
    throw new HttpError(409, "That rider just went offline or took another job. Choose another rider, or let the nearest one take it.");
  }
  return { id: rider.userId, name: rider.user.name };
}

/** Tells the resident's open pages that their Pabili changed, and riders that the list of requests did. */
export async function broadcastErrand(errand: { id: string; residentId: string; status: string }) {
  await Promise.all([
    publish(CHANNELS.user(errand.residentId), { type: "order.updated", orderId: errand.id, status: errand.status }),
    publish(CHANNELS.riders, { type: "jobs.changed" }),
  ]);
}

/** The free riders nearest the customer hear about a Pabili anyone can take (the shop has no pin; it's usually close by). */
export async function tellNearbyRiders(errand: { id: string; shopName: string; deliveryLat: number | null; deliveryLng: number | null; preferredRiderId?: string | null }) {
  const free = await prisma.riderProfile.findMany({ where: availableRider({ vendorId: null }), select: { userId: true } });
  const ids = new Set(free.map((r) => r.userId).filter((id) => id !== errand.preferredRiderId));
  const at = errand.deliveryLat != null && errand.deliveryLng != null ? { lat: errand.deliveryLat, lng: errand.deliveryLng } : TOWN_CENTER;
  const near = await nearestRiders(at, ids, NEARBY_RIDERS);
  await Promise.all(near.map((riderId) => notify(riderId, { title: "New Pabili request", body: `Buy at ${errand.shopName} and deliver it.`, link: "/rider" })));
  return near.length;
}

/**
 * Every worker runs this each second. A conditional UPDATE ... RETURNING hands each errand to one
 * worker, so each step and each message happens once:
 *   the rider a resident asked for didn't answer in time: it opens to every free rider nearby;
 *   nobody took it in ERRAND_WAIT_MINUTES: it's cancelled and the resident is told.
 */
export async function runErrandTimers(log: Log) {
  const opened = await prisma.$queryRaw<{ id: string; residentId: string; shopName: string; deliveryLat: number | null; deliveryLng: number | null; preferredRiderId: string | null }[]>`
    UPDATE "Errand" SET "exclusiveUntil" = NULL
    WHERE status = 'REQUESTED' AND "exclusiveUntil" IS NOT NULL AND "exclusiveUntil" < NOW()
    RETURNING id, "residentId", "shopName", "deliveryLat", "deliveryLng", "preferredRiderId"`;
  for (const errand of opened) {
    const reached = await tellNearbyRiders(errand);
    const rider = errand.preferredRiderId ? await prisma.user.findUnique({ where: { id: errand.preferredRiderId }, select: { name: true } }) : null;
    await notify(errand.residentId, {
      title: `${rider?.name.split(" ")[0] ?? "Your rider"} didn't answer`,
      body: "Your Pabili is now open to the free riders nearby.",
      link: `/resident/pabili/${errand.id}`,
    });
    await broadcastErrand({ ...errand, status: "REQUESTED" });
    log(`pabili ${errand.id.slice(-6)}: opened to ${reached} rider(s) nearby`);
  }

  const expired = await prisma.$queryRaw<{ id: string; residentId: string; shopName: string }[]>`
    UPDATE "Errand" SET status = 'CANCELLED', "cancelReason" = 'No rider took it in time', "finishedAt" = NOW()
    WHERE status = 'REQUESTED' AND "createdAt" < NOW() - make_interval(mins => ${ERRAND_WAIT_MINUTES})
    RETURNING id, "residentId", "shopName"`;
  for (const errand of expired) {
    await notify(errand.residentId, {
      title: "No rider took your Pabili",
      body: `Nobody was free to buy at ${errand.shopName} in ${ERRAND_WAIT_MINUTES} minutes, so it was cancelled. You paid nothing; try again in a while.`,
      link: `/resident/pabili/${errand.id}`,
    });
    await broadcastErrand({ ...errand, status: "CANCELLED" });
    log(`pabili ${errand.id.slice(-6)}: cancelled, no rider in ${ERRAND_WAIT_MINUTES} min`);
  }
}

export { PREFERRED_RIDER_SECONDS };
