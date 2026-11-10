import { config } from "../config.js";
import { distanceKm, type LatLng } from "./geo.js";
import { redis } from "./redis.js";
import { minutesOf, type PeakWindow, type Settings } from "./settings.js";

/**
 * The delivery fee follows the distance, the way food apps in the Philippines price it:
 *
 *   fee = base fee (covers the first few km)
 *       + a price for every km after that (a started km counts as one)
 *       + a small add-on during the lunch and dinner rush
 *
 * The distance is by road, from the store to the resident's pin, as a motorcycle would go
 * (Mapbox Directions). If the map service can't be reached, it's estimated from the straight
 * line times 1.3, the usual gap between straight-line and road distance in a town.
 *
 * The admin sets the prices and the rush hours (Admin → Settings). Nobody turns the rush on or
 * off by hand: at each checkout the system checks the Philippine time against those hours.
 *
 * The rider earns the whole fee, so a longer ride pays the rider more.
 */

/** Road distance is about 1.3× the straight line in a town grid */
const ROAD_FACTOR = 1.3;
/** Roads change rarely; one look-up per store and pin is kept for a week */
const ROUTE_CACHE_SECONDS = 7 * 86400;

export type DeliveryQuote = {
  fee: number;
  /** Road distance, rounded to 0.1 km; null when the store or the address has no map pin */
  km: number | null;
  /** True when the distance came from the road map, false when estimated */
  byRoad: boolean;
  base: number;
  baseKm: number;
  /** Kilometres after the ones the base fee covers, counted whole */
  extraKm: number;
  perKm: number;
  distanceFee: number;
  peakFee: number;
  /** The name of the admin's rush hour while it applies, e.g. "Lunch rush" */
  peak: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n * 100) / 100;

/** The admin's rush hour that the time falls in, if any (Philippine time, UTC+8, no daylight saving) */
export function peakAt(now: Date, windows: PeakWindow[]) {
  const manila = new Date(now.getTime() + 8 * 3600_000);
  const day = manila.getUTCDay();
  const minute = manila.getUTCHours() * 60 + manila.getUTCMinutes();
  return windows.find((w) => w.days.includes(day) && minute >= minutesOf(w.from) && minute < minutesOf(w.to))?.name ?? null;
}

/** Road distance in km from the store to the address, cached in Redis so every API copy shares it. */
export async function roadKm(from: LatLng, to: LatLng): Promise<{ km: number; byRoad: boolean }> {
  const key = `route:${from.lat.toFixed(4)},${from.lng.toFixed(4)}:${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = await redis.get(key).catch(() => null);
  if (hit) return { km: Number(hit), byRoad: true };

  if (config.mapboxToken) {
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
        `?overview=false&access_token=${config.mapboxToken}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const data = (await response.json()) as { routes?: { distance: number }[] };
        const meters = data.routes?.[0]?.distance;
        if (typeof meters === "number") {
          const km = round1(meters / 1000);
          await redis.set(key, String(km), "EX", ROUTE_CACHE_SECONDS).catch(() => undefined);
          return { km, byRoad: true };
        }
      }
    } catch {
      // Slow or offline map service: estimate instead, so checkout never waits on it
    }
  }
  return { km: round1(distanceKm(from, to) * ROAD_FACTOR), byRoad: false };
}

/** The fee for a distance, with each part shown to the resident. */
export function priceDelivery(km: number | null, settings: Settings, now = new Date()): Omit<DeliveryQuote, "byRoad"> {
  const { deliveryFee: base, deliveryBaseKm: baseKm, deliveryPerKm: perKm, deliveryPeakFee } = settings;
  const extraKm = km === null ? 0 : Math.max(0, Math.ceil(round1(km - baseKm)));
  const distanceFee = money(extraKm * perKm);
  const peak = deliveryPeakFee > 0 ? peakAt(now, settings.peakHours) : null;
  const peakFee = peak ? deliveryPeakFee : 0;
  return { fee: money(base + distanceFee + peakFee), km, base, baseKm, extraKm, perKm, distanceFee, peakFee, peak };
}

type Pin = { latitude: number | null; longitude: number | null };
const pinOf = (p: Pin): LatLng | null => (p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null);

/** The fee from a store to an address. Without both pins, it's the base fee (plus the rush add-on). */
export async function quoteDelivery(store: Pin, address: Pin, settings: Settings, now = new Date()): Promise<DeliveryQuote> {
  const from = pinOf(store);
  const to = pinOf(address);
  const route = from && to ? await roadKm(from, to) : null;
  return { ...priceDelivery(route?.km ?? null, settings, now), byRoad: route?.byRoad ?? false };
}
