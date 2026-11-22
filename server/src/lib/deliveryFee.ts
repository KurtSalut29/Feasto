import { config } from "../config.js";
import { distanceKm, type LatLng } from "./geo.js";
import { redis } from "./redis.js";
import { NO_ADD_ONS, type AddOns } from "./feeAddOns.js";
import type { Settings } from "./settings.js";
import { slowRoadFor } from "./daloy.js";

/**
 * The delivery fee follows the distance, the way food apps in the Philippines price it:
 *
 *   fee = base fee (covers the first few km)
 *       + a price for every km after that (a started km counts as one)
 *       + an add-on when riders are busy or it rains (lib/feeAddOns.ts), never fixed hours
 *
 * The distance is by road, from the store to the resident's pin, as a motorcycle would go
 * (Mapbox Directions). If the map service can't be reached, it's estimated from the straight
 * line times 1.3, the usual gap between straight-line and road distance in a town.
 *
 * The admin sets the prices (Admin → Settings). The rider earns the whole fee, add-ons included,
 * so a longer or harder ride pays the rider more.
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
} & AddOns;

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => Math.round(n * 100) / 100;

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
export function priceDelivery(km: number | null, settings: Pick<Settings, "deliveryFee" | "deliveryBaseKm" | "deliveryPerKm">, addOns: AddOns = NO_ADD_ONS): Omit<DeliveryQuote, "byRoad"> {
  const { deliveryFee: base, deliveryBaseKm: baseKm, deliveryPerKm: perKm } = settings;
  const extraKm = km === null ? 0 : Math.max(0, Math.ceil(round1(km - baseKm)));
  const distanceFee = money(extraKm * perKm);
  return { fee: money(base + distanceFee + addOns.busyFee + addOns.rainFee + (addOns.daloyFee ?? 0)), km, base, baseKm, extraKm, perKm, distanceFee, ...addOns };
}

type Pin = { latitude: number | null; longitude: number | null };
const pinOf = (p: Pin): LatLng | null => (p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null);

/**
 * The fee from a store to an address. Without both pins, it's the base fee (plus any add-on).
 * With `forUser` (a live order, not a scheduled one), the Daloy slow-road add-on for this way is
 * added too, held for that resident for 10 minutes like the others.
 */
export async function quoteDelivery(store: Pin, address: Pin, settings: Settings, addOns: AddOns = NO_ADD_ONS, forUser?: string): Promise<DeliveryQuote> {
  const from = pinOf(store);
  const to = pinOf(address);
  const route = from && to ? await roadKm(from, to) : null;
  const slow = forUser && from && to && route ? await slowRoadFor(forUser, from, to, route.km, settings) : null;
  const withSlow: AddOns = slow ? { ...addOns, daloyFee: slow.fee, daloy: slow.reason } : addOns;
  return { ...priceDelivery(route?.km ?? null, settings, withSlow), byRoad: route?.byRoad ?? false };
}
