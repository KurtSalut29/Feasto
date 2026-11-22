import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { cellShape, cellsNow, cellsWeek, PACE_MIN_RIDES, refreshPace, RIDES_FOR_ETA } from "../lib/daloy.js";
import { MINUTES_PER_KM, paceNow } from "../lib/eta.js";
import { getSettings } from "../lib/settings.js";
import { BUSY, BUSY_ERRAND, riderPositions } from "../lib/dispatch.js";
import { demandNow, rainNow } from "../lib/feeAddOns.js";
import { distanceKm } from "../lib/geo.js";
import { orderCode } from "../lib/orders.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * Admin › Daloy: the live map of riders and of how fast Naval's roads are going now, against the
 * usual, from the riders' own rides; and how that's used: the ETA's pace, the slow-road add-on and
 * the riders' delay bonuses.
 */
export const adminDaloyRouter = Router();
adminDaloyRouter.use(requireAuth, requireRole("ADMIN"));

const query = z.object({
  view: z.enum(["now", "week"]).default("now"),
  demo: z.enum(["0", "1"]).default("0"),
});

/** A square is named after the nearest store with a pin, within this far */
const NAME_WITHIN_KM = 0.6;

adminDaloyRouter.get("/", async (req, res) => {
  const { view, demo } = query.parse(req.query);
  const withDemo = demo === "1";
  const demoFilter = withDemo ? {} : { demo: false };
  const today = manilaStartOfDay();

  const [learned, settings, money] = await Promise.all([
    refreshPace(),
    getSettings(),
    prisma.order.aggregate({ where: { finishedAt: { gte: today }, status: { in: ["DELIVERED", "COMPLETED"] } }, _sum: { daloyFee: true, riderBonus: true }, _count: { _all: true } }),
  ]);
  const [daloyOrders, bonusOrders] = await Promise.all([
    prisma.order.count({ where: { finishedAt: { gte: today }, daloyFee: { gt: 0 } } }),
    prisma.order.count({ where: { finishedAt: { gte: today }, riderBonus: { gt: 0 } } }),
  ]);
  const [positions, cells, stores, demand, rain, trips, todayLegs, realRides, demoRides] = await Promise.all([
    riderPositions(),
    view === "now" ? cellsNow(withDemo) : cellsWeek(withDemo),
    prisma.vendor.findMany({ where: { status: "APPROVED", latitude: { not: null }, longitude: { not: null } }, select: { name: true, latitude: true, longitude: true } }),
    demandNow(),
    rainNow(),
    prisma.tripLeg.findMany({
      where: demoFilter,
      orderBy: { endedAt: "desc" },
      take: 25,
      select: { id: true, orderId: true, errandId: true, kind: true, startedAt: true, endedAt: true, riddenKm: true, movingSeconds: true, stoppedSeconds: true, expectedMinutes: true, demo: true },
    }),
    prisma.tripLeg.findMany({ where: { ...demoFilter, endedAt: { gte: today } }, select: { riddenKm: true, movingSeconds: true, stoppedSeconds: true, expectedMinutes: true, startedAt: true, endedAt: true } }),
    prisma.tripLeg.count({ where: { demo: false } }),
    prisma.tripLeg.count({ where: { demo: true } }),
  ]);

  // Who the riders on the map are, and what they're doing
  const ids = positions.map((p) => p.userId);
  const [users, orders, errands] = ids.length
    ? await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, riderProfile: { select: { isOnline: true, vendor: { select: { name: true } } } } } }),
        prisma.order.findMany({ where: { riderId: { in: ids }, status: { in: BUSY } }, select: { id: true, riderId: true, status: true } }),
        prisma.errand.findMany({ where: { riderId: { in: ids }, status: { in: BUSY_ERRAND } }, select: { id: true, riderId: true, status: true } }),
      ])
    : [[], [], []];
  const byId = new Map(users.map((u) => [u.id, u]));
  const now = Date.now();
  const riders = positions
    .filter((p) => byId.get(p.userId)?.riderProfile?.isOnline)
    .map((p) => {
      const user = byId.get(p.userId)!;
      const order = orders.find((o) => o.riderId === p.userId);
      const errand = errands.find((e) => e.riderId === p.userId);
      const job = order
        ? { kind: "delivery" as const, code: orderCode(order.id), heading: order.status === "PICKED_UP" ? "to the customer" : "to the store" }
        : errand
          ? { kind: "pabili" as const, code: orderCode(errand.id), heading: errand.status === "BOUGHT" ? "to the customer" : "to the shop" }
          : null;
      return { id: p.userId, name: user.name, store: user.riderProfile?.vendor?.name ?? null, at: { lat: p.lat, lng: p.lng }, secondsAgo: Math.round((now - p.at) / 1000), job };
    });

  const pins = stores.map((s) => ({ name: s.name, at: { lat: s.latitude!, lng: s.longitude! } }));
  const nameOf = (center: { lat: number; lng: number }) => {
    let best: { name: string; km: number } | null = null;
    for (const s of pins) {
      const km = distanceKm(center, s.at);
      if (km <= NAME_WITHIN_KM && (!best || km < best.km)) best = { name: s.name, km };
    }
    return best ? `Near ${best.name}` : `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  };
  const areas = cells.map((c) => {
    const shape = cellShape(c.cell);
    return { ...c, area: nameOf(shape.center), center: shape.center, ring: shape.ring };
  });

  const minutesOf = (t: { startedAt: Date; endedAt: Date }) => Math.max(1, Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 60_000));
  const ridden = todayLegs.reduce((sum, t) => sum + Number(t.riddenKm), 0);
  const moving = todayLegs.reduce((sum, t) => sum + t.movingSeconds, 0);
  const stopped = todayLegs.reduce((sum, t) => sum + t.stoppedSeconds, 0);
  const estimated = todayLegs.filter((t) => t.expectedMinutes != null);
  const overEstimate = estimated.filter((t) => minutesOf(t) > t.expectedMinutes! * 1.25).length;

  res.json({
    view,
    withDemo,
    riders,
    areas,
    demand,
    rain: { on: rain.on, by: rain.by, reports: rain.reports },
    today: {
      rides: todayLegs.length,
      km: Math.round(ridden * 10) / 10,
      /** Average while moving, and with the stops (lights, traffic) counted */
      movingKmh: moving > 0 ? Math.round((ridden / moving) * 3600 * 10) / 10 : null,
      overallKmh: moving + stopped > 0 ? Math.round((ridden / (moving + stopped)) * 3600 * 10) / 10 : null,
      stoppedShare: moving + stopped > 0 ? Math.round((stopped / (moving + stopped)) * 100) : null,
      estimated: estimated.length,
      overEstimate,
    },
    progress: { realRides, demoRides, needed: RIDES_FOR_ETA },
    pace: {
      now: paceNow(),
      fallback: MINUTES_PER_KM,
      learned: paceNow() !== MINUTES_PER_KM || Boolean(learned?.pace[(new Date().getUTCHours() + 8) % 24]),
      hoursLearned: Object.keys(learned?.pace ?? {}).length,
      ridesThisHour: learned?.rides[(new Date().getUTCHours() + 8) % 24] ?? 0,
      needed: PACE_MIN_RIDES,
    },
    uses: {
      feeOn: settings.daloyFeeOn,
      feePerMinute: settings.daloyPerMinute,
      feeMax: settings.daloyFeeMax,
      bonusOn: settings.delayBonusOn,
      feesToday: Number(money._sum.daloyFee ?? 0),
      feeOrdersToday: daloyOrders,
      bonusesToday: Number(money._sum.riderBonus ?? 0),
      bonusOrdersToday: bonusOrders,
    },
    trips: trips.map((t) => {
      const seconds = t.movingSeconds + t.stoppedSeconds;
      return {
        id: t.id,
        code: orderCode(t.orderId ?? t.errandId ?? t.id),
        pabili: Boolean(t.errandId),
        kind: t.kind,
        endedAt: t.endedAt,
        km: Number(t.riddenKm),
        minutes: minutesOf(t),
        expectedMinutes: t.expectedMinutes,
        kmh: seconds > 0 ? Math.round((Number(t.riddenKm) / seconds) * 3600 * 10) / 10 : null,
        stoppedMinutes: Math.round(t.stoppedSeconds / 60),
        demo: t.demo,
      };
    }),
  });
});
