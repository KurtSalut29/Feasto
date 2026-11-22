import { prisma } from "./db.js";
import { BUSY, BUSY_ERRAND, jobVisibleTo, OPEN_JOB } from "./dispatch.js";
import { distanceKm, type LatLng } from "./geo.js";
import { orderCode } from "./orders.js";
import { getSettings } from "./settings.js";

/**
 * One rider, two orders: a rider on a delivery may take a second one before picking up the first,
 * when the second store is close to the first (or the same) and the two doors are close too, so both
 * residents get their food from one trip. Never a third, never with a Pabili, never after the first
 * was picked up (it's on its way). The admin turns it on or off and sets the distances.
 */

const pin = (lat: number | null | undefined, lng: number | null | undefined): LatLng | null => (lat != null && lng != null ? { lat, lng } : null);

/** The rider's one delivery a second order could join, or null (none, two already, picked up, a Pabili, or off) */
export async function tripBase(userId: string) {
  const settings = await getSettings();
  if (!settings.batchingOn) return null;
  const [orders, errands] = await Promise.all([
    prisma.order.findMany({
      where: { riderId: userId, status: { in: BUSY } },
      select: { id: true, status: true, vendorId: true, vendor: { select: { latitude: true, longitude: true } }, checkout: { select: { deliveryLat: true, deliveryLng: true } } },
    }),
    prisma.errand.count({ where: { riderId: userId, status: { in: BUSY_ERRAND } } }),
  ]);
  if (errands > 0 || orders.length !== 1 || orders[0]!.status === "PICKED_UP") return null;
  const o = orders[0]!;
  const store = pin(o.vendor.latitude, o.vendor.longitude);
  const door = pin(o.checkout.deliveryLat, o.checkout.deliveryLng);
  if (!store || !door) return null;
  return { id: o.id, vendorId: o.vendorId, store, door, settings };
}

type Base = NonNullable<Awaited<ReturnType<typeof tripBase>>>;
type Job = { vendorId: string; vendor: { latitude: number | null; longitude: number | null }; checkout: { deliveryLat: number | null; deliveryLng: number | null } };

/** How far the second order's store and door are from the first's, and whether that's close enough */
function fit(base: Base, job: Job) {
  const store = pin(job.vendor.latitude, job.vendor.longitude);
  const door = pin(job.checkout.deliveryLat, job.checkout.deliveryLng);
  if (!store || !door) return null;
  const storeMeters = job.vendorId === base.vendorId ? 0 : Math.round(distanceKm(base.store, store) * 1000);
  const doorKm = Math.round(distanceKm(base.door, door) * 10) / 10;
  return { storeMeters, doorKm, ok: storeMeters <= base.settings.batchPickupMeters && doorKm <= base.settings.batchDropKm };
}

/** Why this rider can't add this job to their trip, or null when they can */
export async function tripProblem(userId: string, jobId: string) {
  const base = await tripBase(userId);
  if (!base) return "Finish your current delivery first.";
  const job = await prisma.order.findUnique({
    where: { id: jobId },
    select: { vendorId: true, fulfillment: true, vendor: { select: { latitude: true, longitude: true } }, checkout: { select: { deliveryLat: true, deliveryLng: true } } },
  });
  if (!job || job.fulfillment !== "DELIVERY") return "This job isn't available.";
  const f = fit(base, job);
  if (!f) return "Without both map pins, it can't be added to your trip.";
  if (!f.ok) return `Too far to take on this trip (the stores are ${f.storeMeters} m apart, the doors ${f.doorKm} km). Finish your current delivery first.`;
  return null;
}

/** Open jobs this rider could add to their trip now, nearest store first */
export async function tripJobs(userId: string, profile: Parameters<typeof jobVisibleTo>[0]) {
  const base = await tripBase(userId);
  if (!base) return { base: null, jobs: [] };
  const open = await prisma.order.findMany({
    where: { id: { not: base.id }, riderId: null, fulfillment: "DELIVERY", status: { in: OPEN_JOB }, ...jobVisibleTo(profile) },
    take: 50,
    select: {
      id: true,
      vendorId: true,
      deliveryFee: true,
      readyBy: true,
      vendor: { select: { name: true, address: true, latitude: true, longitude: true } },
      checkout: { select: { deliveryAddress: true, deliveryLat: true, deliveryLng: true } },
      items: { select: { quantity: true } },
    },
  });
  const jobs = open
    .map((j) => ({ j, f: fit(base, j) }))
    .filter((x) => x.f?.ok)
    .sort((a, b) => a.f!.storeMeters - b.f!.storeMeters)
    .slice(0, 5)
    .map(({ j, f }) => ({
      id: j.id,
      code: orderCode(j.id),
      store: j.vendor.name,
      storeAddress: j.vendor.address,
      deliveryAddress: j.checkout.deliveryAddress,
      deliveryFee: Number(j.deliveryFee),
      items: j.items.reduce((n, i) => n + i.quantity, 0),
      readyBy: j.readyBy?.toISOString() ?? null,
      sameStore: j.vendorId === base.vendorId,
      storeMeters: f!.storeMeters,
      doorKm: f!.doorKm,
    }));
  return { base: { id: base.id, code: orderCode(base.id) }, jobs };
}
