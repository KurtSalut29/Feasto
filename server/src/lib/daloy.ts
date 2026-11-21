import { randomUUID } from "node:crypto";
import type { TripLegKind } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { MINUTES_PER_KM } from "./eta.js";
import { distanceKm, type LatLng } from "./geo.js";
import { marshal, unmarshal } from "./marshalling.js";
import { redis } from "./redis.js";

/**
 * Daloy, step 1: learn how fast riders really move in Naval, from the positions their phones
 * already send on a job (every few seconds, for the customer's live map). Nothing here changes a
 * fee or an ETA yet: it only records, so later steps have real data to stand on.
 *
 * Two things are kept:
 * - Each ride of a job (to the store, to the door, to the Pabili shop) as a TripLeg: how long it
 *   took, how far it went, how long the rider was stopped, and Feasto's estimate at the time.
 * - The metres and seconds ridden through each square of the map (about 440 m a side) in each
 *   15 minutes, as a TravelSample. No rider or order is kept there, only the road's speed.
 *
 * What doesn't count as road speed: the last 100 m before the spot and the first 60 m after the
 * start (parking, waiting at the store or the gate), a stop that runs past 2 minutes (a call, a
 * break), jumps no motorcycle could make (a bad GPS fix), and gaps of over 2 minutes (no signal).
 */

/** The grid: 0.004 degrees is about 440 m north to south in Naval, a few blocks */
export const CELL_DEGREES = 0.004;
const BUCKET_MS = 15 * 60_000;
/** Nearer than this to the spot, the ride is over (and the rider is parking, not riding) */
const ARRIVED_M = 100;
const NEAR_START_M = 60;
/** Slower than this (about 5 km/h) is stopped */
const MOVING_MPS = 1.4;
/** Faster than this (120 km/h) is a bad GPS fix */
const JUMP_MPS = 33;
/** A stop longer than this stops counting as traffic */
const LONG_STOP_S = 120;
const GAP_S = 120;
/** Positions closer together than this in time are skipped (the phone sent two at once) */
const MIN_STEP_S = 1.5;
const RIDE_TTL_S = 6 * 3600;

export type DaloyJob = {
  id: string;
  kind: "ORDER" | "ERRAND";
  leg: TripLegKind;
  riderId: string;
  /** Where this ride is going, when it has a pin (a Pabili shop has none) */
  destination: LatLng | null;
  /** The road distance Feasto priced the delivery with, for the estimate of the ride to the door */
  pricedKm: number | null;
};

type Ride = {
  leg: TripLegKind;
  riderId: string;
  kind: "ORDER" | "ERRAND";
  demo: boolean;
  startedAt: number;
  start: LatLng;
  last: LatLng & { t: number };
  destination: LatLng | null;
  pricedKm: number | null;
  meters: number;
  moving: number;
  stopped: number;
  /** How long the rider has been stopped, without moving in between */
  still: number;
  points: number;
  /** Reached the spot: positions after that are parking or waiting, not riding */
  done?: boolean;
};

const rideKey = (jobId: string) => `daloy:ride:${jobId}`;
const where = (jobId: string) => ({ transport: "redis" as const, channel: rideKey(jobId), kind: "daloy ride" });

export const cellOf = ({ lat, lng }: LatLng) => `${Math.floor(lat / CELL_DEGREES)}:${Math.floor(lng / CELL_DEGREES)}`;

/** The square's corners and middle, for the map */
export function cellShape(cell: string) {
  const [row, col] = cell.split(":").map(Number);
  const south = row * CELL_DEGREES;
  const west = col * CELL_DEGREES;
  const north = south + CELL_DEGREES;
  const east = west + CELL_DEGREES;
  return {
    center: { lat: (south + north) / 2, lng: (west + east) / 2 },
    ring: [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ] as [number, number][],
  };
}

const bucketOf = (t: number) => new Date(Math.floor(t / BUCKET_MS) * BUCKET_MS);
const metres = (a: LatLng, b: LatLng) => distanceKm(a, b) * 1000;

async function readRide(jobId: string) {
  const raw = await redis.get(rideKey(jobId));
  return raw ? unmarshal<Ride>(raw, where(jobId)) : null;
}

const saveRide = (jobId: string, ride: Ride) => redis.set(rideKey(jobId), marshal(ride, where(jobId)), "EX", RIDE_TTL_S);

/** Adds one stretch of road to its square's 15 minutes */
async function addSample(at: LatLng, t: number, meters: number, seconds: number, demo: boolean) {
  await prisma.$executeRaw`
    INSERT INTO "TravelSample" ("id", "cell", "bucket", "demo", "meters", "seconds", "samples")
    VALUES (${randomUUID()}, ${cellOf(at)}, ${bucketOf(t)}, ${demo}, ${meters}, ${seconds}, 1)
    ON CONFLICT ("cell", "bucket", "demo") DO UPDATE SET
      "meters" = "TravelSample"."meters" + EXCLUDED."meters",
      "seconds" = "TravelSample"."seconds" + EXCLUDED."seconds",
      "samples" = "TravelSample"."samples" + 1`;
}

/** Feasto's estimate for the ride, as the ETA counts it today: 3 minutes a km (no time to park) */
function estimateOf(ride: Ride, straightKm: number) {
  if (ride.leg === "TO_DOOR" && ride.pricedKm != null) return Math.max(1, Math.round(ride.pricedKm * MINUTES_PER_KM));
  // No priced distance: the straight line times 1.3, as the delivery fee guesses a road
  if (ride.destination) return Math.max(1, Math.round(straightKm * 1.3 * MINUTES_PER_KM));
  return null;
}

/** Logs the ride as a TripLeg. Too short to mean anything (a few seconds, two positions) is dropped. */
async function logRide(jobId: string, ride: Ride) {
  const seconds = ride.moving + ride.stopped;
  if (ride.points < 3 || seconds < 20) return false;
  const straightKm = distanceKm(ride.start, ride.last);
  await prisma.tripLeg.createMany({
    data: [
      {
        ...(ride.kind === "ORDER" ? { orderId: jobId } : { errandId: jobId }),
        riderId: ride.riderId,
        kind: ride.leg,
        startedAt: new Date(ride.startedAt),
        endedAt: new Date(ride.last.t),
        riddenKm: Math.min(ride.meters / 1000, 9999).toFixed(2),
        straightKm: Math.min(straightKm, 9999).toFixed(2),
        movingSeconds: Math.round(ride.moving),
        stoppedSeconds: Math.round(ride.stopped),
        expectedMinutes: estimateOf(ride, straightKm),
        points: ride.points,
        demo: ride.demo,
      },
    ],
    // A ride is logged once, even if two API copies end it at the same moment
    skipDuplicates: true,
  });
  return true;
}

/**
 * One position from the rider's phone on a job. Called by the live-location endpoints after they
 * checked the job is the rider's. Never throws: recording must not stop the customer's live map.
 */
export async function recordPosition(job: DaloyJob, at: LatLng, demo: boolean, now = Date.now()) {
  try {
    let ride = await readRide(job.id);
    // The job moved on (picked up, bought): the last ride ends where it was
    if (ride && ride.leg !== job.leg) {
      if (!ride.done) await logRide(job.id, ride);
      ride = null;
    }
    if (ride?.done) return;
    if (!ride) {
      await saveRide(job.id, {
        leg: job.leg,
        riderId: job.riderId,
        kind: job.kind,
        demo,
        startedAt: now,
        start: at,
        last: { ...at, t: now },
        destination: job.destination,
        pricedKm: job.pricedKm,
        meters: 0,
        moving: 0,
        stopped: 0,
        still: 0,
        points: 1,
      });
      return;
    }
    // A demo ride mixed into a real one (or the other way) makes the whole ride a demo
    ride.demo ||= demo;
    const seconds = (now - ride.last.t) / 1000;
    if (seconds < MIN_STEP_S) return;
    const meters = metres(ride.last, at);
    if (seconds > GAP_S) {
      // No signal for a while: start again from here, without guessing the gap
      ride.last = { ...at, t: now };
      ride.points += 1;
    } else if (meters / seconds > JUMP_MPS) {
      // A bad fix: ignore it and wait for the next
      return;
    } else {
      const moving = meters / seconds >= MOVING_MPS;
      if (moving) {
        ride.moving += seconds;
        ride.still = 0;
      } else {
        ride.stopped += seconds;
        ride.still += seconds;
      }
      ride.meters += meters;
      const middle = { lat: (ride.last.lat + at.lat) / 2, lng: (ride.last.lng + at.lng) / 2 };
      const nearEnd = (ride.destination && metres(middle, ride.destination) < ARRIVED_M) || metres(middle, ride.start) < NEAR_START_M;
      if (!nearEnd && (moving || ride.still <= LONG_STOP_S)) await addSample(middle, now, meters, seconds, ride.demo);
      ride.last = { ...at, t: now };
      ride.points += 1;
    }
    if (ride.destination && metres(at, ride.destination) < ARRIVED_M) {
      await logRide(job.id, ride);
      ride.done = true;
    }
    await saveRide(job.id, ride);
  } catch (error) {
    console.error("Daloy couldn't record a position", error);
  }
}

/**
 * The ride ends without reaching its pin: picked up, bought, at the door, delivered. Logs it if it
 * wasn't logged on arrival. With `forget`, the job is over and its ride is cleared.
 */
export async function endRide(jobId: string, { forget = false } = {}) {
  try {
    const ride = await readRide(jobId);
    if (ride && !ride.done) {
      await logRide(jobId, ride);
      ride.done = true;
      if (!forget) await saveRide(jobId, ride);
    }
    if (forget) await redis.del(rideKey(jobId));
  } catch (error) {
    console.error("Daloy couldn't end a ride", error);
  }
}

/** Old squares go after 90 days; the usual is worked out from the last 28, so that's plenty */
export async function forgetOldTravel() {
  if ((await redis.set("lock:daloy-forget", "1", "EX", 6 * 3600, "NX")) !== "OK") return 0;
  const { count } = await prisma.travelSample.deleteMany({ where: { bucket: { lt: new Date(Date.now() - 90 * 86_400_000) } } });
  return count;
}

// ---------- For the admin's map ----------

/** With fewer seconds of riding than this in a square (about one pass through it), it isn't shown */
const NOW_MIN_SECONDS = 20;
const USUAL_MIN_SECONDS = 300;
const NOW_WINDOW_MS = 30 * 60_000;

export type CellState = "normal" | "slow" | "very-slow" | "no-usual";

export type CellNow = { cell: string; kmh: number; seconds: number; usualKmh: number | null; state: CellState };
export type CellWeek = { cell: string; kmh: number; seconds: number };

const kmhOf = (meters: number, seconds: number) => Math.round((meters / seconds) * 3.6 * 10) / 10;

export function stateOf(kmh: number, usualKmh: number | null): CellState {
  if (usualKmh == null) return "no-usual";
  if (kmh < usualKmh * 0.55) return "very-slow";
  if (kmh < usualKmh * 0.75) return "slow";
  return "normal";
}

/**
 * Each square ridden through in the last half hour, against its usual at this time of day: the
 * same hour give or take one, over the 28 days before (Manila time).
 */
export async function cellsNow(withDemo: boolean, now = new Date()): Promise<CellNow[]> {
  const since = new Date(now.getTime() - NOW_WINDOW_MS);
  const demo = withDemo ? [false, true] : [false];
  const hour = (now.getUTCHours() + 8) % 24;
  const rows = await prisma.$queryRaw<{ cell: string; m: number; s: number; um: number | null; us: number | null }[]>`
    WITH recent AS (
      SELECT "cell", SUM("meters") AS m, SUM("seconds") AS s FROM "TravelSample"
      WHERE "bucket" >= ${bucketOf(since.getTime())} AND "demo" = ANY(${demo}) GROUP BY "cell"
    ), usual AS (
      SELECT "cell", SUM("meters") AS m, SUM("seconds") AS s FROM "TravelSample"
      WHERE "bucket" >= ${new Date(now.getTime() - 28 * 86_400_000)} AND "bucket" < ${bucketOf(since.getTime())} AND "demo" = ANY(${demo})
        AND (EXTRACT(HOUR FROM "bucket" + INTERVAL '8 hours')::int - ${hour}::int + 24) % 24 IN (0, 1, 23)
        AND "cell" IN (SELECT "cell" FROM recent)
      GROUP BY "cell"
    )
    SELECT recent."cell", recent.m::float8 AS m, recent.s::float8 AS s, usual.m::float8 AS um, usual.s::float8 AS us
    FROM recent LEFT JOIN usual ON usual."cell" = recent."cell"
    WHERE recent.s >= ${NOW_MIN_SECONDS}`;
  return rows.map((r) => {
    const kmh = kmhOf(r.m, r.s);
    const usualKmh = r.us != null && r.um != null && r.us >= USUAL_MIN_SECONDS ? kmhOf(r.um, r.us) : null;
    return { cell: r.cell, kmh, seconds: Math.round(r.s), usualKmh, state: stateOf(kmh, usualKmh) };
  });
}

/** Each square's average speed over the last 7 days: where riders go, and how fast */
export async function cellsWeek(withDemo: boolean, now = new Date()): Promise<CellWeek[]> {
  const demo = withDemo ? [false, true] : [false];
  const rows = await prisma.$queryRaw<{ cell: string; m: number; s: number }[]>`
    SELECT "cell", SUM("meters")::float8 AS m, SUM("seconds")::float8 AS s FROM "TravelSample"
    WHERE "bucket" >= ${new Date(now.getTime() - 7 * 86_400_000)} AND "demo" = ANY(${demo})
    GROUP BY "cell" HAVING SUM("seconds") >= ${NOW_MIN_SECONDS}`;
  return rows.map((r) => ({ cell: r.cell, kmh: kmhOf(r.m, r.s), seconds: Math.round(r.s) }));
}

/** About this many real rides before the ETA can lean on them (step 2) */
export const RIDES_FOR_ETA = 200;
