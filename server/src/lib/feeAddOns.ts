import { prisma } from "./db.js";
import { availableRider } from "./dispatch.js";
import { redis } from "./redis.js";
import type { Settings } from "./settings.js";

/**
 * What's added to a delivery fee because of what's happening right now, instead of fixed rush hours:
 *
 * - Busy: more orders are waiting for a rider than there are free riders. Half the admin's most when
 *   there are more orders than riders, all of it at twice as many or more. A quiet lunch adds nothing.
 * - Rain: while it rains. The admin turns it on, or it turns on by itself when two riders report rain
 *   within half an hour (for an hour).
 *
 * Every peso of it goes to the rider. The resident sees it, with the reason, before ordering, and it
 * can't go up for 10 minutes while they look (it can still go down). Scheduled orders never get it:
 * nobody knows yet how busy it will be.
 */

export type AddOns = {
  busyFee: number;
  /** Why, e.g. "6 orders waiting for 2 free riders" */
  busy: string | null;
  rainFee: number;
  rain: boolean;
};

export const NO_ADD_ONS: AddOns = { busyFee: 0, busy: null, rainFee: 0, rain: false };

const DEMAND_KEY = "demand:now";
const RAIN_KEY = "weather:rain";
const RAIN_REPORTS_KEY = "weather:rain-reports";
/** Riders' rain reports count for this long */
const REPORT_WINDOW_MS = 30 * 60_000;
/** Reports from this many different riders turn the rain add-on on */
const REPORTS_NEEDED = 2;
/** For this long, when riders turned it on */
const RIDER_RAIN_MINUTES = 60;
/** How long the fee a resident was shown can't go up */
const LOCK_SECONDS = 10 * 60;

export type Demand = { waiting: number; freeRiders: number };

/** Jobs waiting for a rider, and riders free to take one. Counted at most every 20 seconds. */
export async function demandNow(): Promise<Demand> {
  const hit = await redis.get(DEMAND_KEY).catch(() => null);
  if (hit) return JSON.parse(hit) as Demand;
  const soon = new Date(Date.now() + 30 * 60_000);
  const [orders, errands, freeRiders] = await Promise.all([
    prisma.order.count({
      where: {
        fulfillment: "DELIVERY",
        riderId: null,
        status: { in: ["PLACED", "ACCEPTED", "PREPARING", "READY"] },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: soon } }],
      },
    }),
    prisma.errand.count({ where: { status: "REQUESTED" } }),
    prisma.riderProfile.count({ where: availableRider({}) }),
  ]);
  const demand = { waiting: orders + errands, freeRiders };
  await redis.set(DEMAND_KEY, JSON.stringify(demand), "EX", 20).catch(() => undefined);
  return demand;
}

const riders = (n: number) => (n === 0 ? "no free rider" : n === 1 ? "1 free rider" : `${n} free riders`);

/** The busy add-on for a count of waiting jobs and free riders. A couple of orders never count as busy. */
export function busyFeeFor({ waiting, freeRiders }: Demand, max: number): { fee: number; reason: string | null } {
  if (max <= 0 || waiting < 2) return { fee: 0, reason: null };
  const perRider = waiting / Math.max(freeRiders, 1);
  if (perRider <= 1) return { fee: 0, reason: null };
  const fee = perRider >= 2 ? max : Math.round(max / 2);
  return { fee, reason: `${waiting} orders waiting for ${riders(freeRiders)}` };
}

// ---------- Rain ----------

export type Rain = { on: boolean; by: "admin" | "riders" | null; until: string | null; reports: number };

async function rainReports(now = Date.now()) {
  await redis.zremrangebyscore(RAIN_REPORTS_KEY, 0, now - REPORT_WINDOW_MS).catch(() => undefined);
  return redis.zcard(RAIN_REPORTS_KEY).catch(() => 0);
}

export async function rainNow(): Promise<Rain> {
  const [raw, reports] = await Promise.all([redis.get(RAIN_KEY).catch(() => null), rainReports()]);
  if (!raw) return { on: false, by: null, until: null, reports };
  const saved = JSON.parse(raw) as { by: "admin" | "riders"; until: string };
  return { on: true, by: saved.by, until: saved.until, reports };
}

/** The admin's switch: on for a number of hours, or off */
export async function setRain(on: boolean, hours = 3): Promise<Rain> {
  if (!on) {
    await redis.del(RAIN_KEY, RAIN_REPORTS_KEY);
  } else {
    const until = new Date(Date.now() + hours * 3600_000);
    await redis.set(RAIN_KEY, JSON.stringify({ by: "admin", until: until.toISOString() }), "EX", hours * 3600);
  }
  await redis.del(DEMAND_KEY).catch(() => undefined);
  return rainNow();
}

/** A rider says it's raining where they are. Two riders within half an hour turn the add-on on. */
export async function reportRain(riderId: string): Promise<Rain & { turnedOn: boolean }> {
  const now = Date.now();
  await redis.zadd(RAIN_REPORTS_KEY, now, riderId);
  await redis.pexpire(RAIN_REPORTS_KEY, REPORT_WINDOW_MS);
  const reports = await rainReports(now);
  let turnedOn = false;
  if (reports >= REPORTS_NEEDED && !(await redis.exists(RAIN_KEY))) {
    const until = new Date(now + RIDER_RAIN_MINUTES * 60_000);
    // NX: if the admin turned it on meanwhile, theirs stays
    turnedOn = (await redis.set(RAIN_KEY, JSON.stringify({ by: "riders", until: until.toISOString() }), "EX", RIDER_RAIN_MINUTES * 60, "NX")) === "OK";
  }
  return { ...(await rainNow()), turnedOn };
}

// ---------- Together ----------

/** What's added right now, from the counts and the weather */
export async function addOnsNow(settings: Pick<Settings, "busyFeeMax" | "rainFee">): Promise<AddOns> {
  const [demand, rain] = await Promise.all([demandNow(), rainNow()]);
  const busy = busyFeeFor(demand, settings.busyFeeMax);
  const rainFee = rain.on ? settings.rainFee : 0;
  return { busyFee: busy.fee, busy: busy.reason, rainFee, rain: rain.on && rainFee > 0 };
}

/**
 * The add-ons for one resident: never more than what they were shown in the last 10 minutes, so
 * the fee doesn't go up between the cart and "Place order". Lower is passed on at once.
 */
export async function addOnsFor(userId: string, settings: Pick<Settings, "busyFeeMax" | "rainFee">): Promise<AddOns> {
  const now = await addOnsNow(settings);
  const key = `feelock:${userId}`;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) {
    await redis.set(key, JSON.stringify(now), "EX", LOCK_SECONDS).catch(() => undefined);
    return now;
  }
  const shown = JSON.parse(raw) as AddOns;
  const lower: AddOns = {
    busyFee: Math.min(shown.busyFee, now.busyFee),
    busy: shown.busyFee <= now.busyFee ? shown.busy : now.busy,
    rainFee: Math.min(shown.rainFee, now.rainFee),
    rain: shown.rainFee <= now.rainFee ? shown.rain : now.rain,
  };
  if (lower.busyFee !== shown.busyFee || lower.rainFee !== shown.rainFee) {
    await redis.set(key, JSON.stringify(lower), "KEEPTTL").catch(() => undefined);
  }
  return lower;
}

/** "Busy: 6 orders waiting for 2 free riders · Rain", for the order's record; null when nothing was added */
export function addOnNote(a: AddOns) {
  const parts = [a.busyFee > 0 && `Busy +₱${a.busyFee}: ${a.busy}`, a.rainFee > 0 && `Rain +₱${a.rainFee}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const addOnTotal = (a: AddOns) => a.busyFee + a.rainFee;
