/** Map helpers that work on the server and in the browser. */

export type LatLng = { lat: number; lng: number };

/** Naval town center, Biliran: where the map starts before any pin is known. */
export const DEFAULT_CENTER: LatLng = { lat: 11.5618, lng: 124.3965 };

/** A pin from two nullable database columns, or null when it isn't set. */
export function pinOf(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  return lat == null || lng == null ? null : { lat, lng };
}

/** Straight-line distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** "850 m" or "1.4 km". */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1)} km`;
}

/**
 * Rough travel time when no road route is available: roads are about 1.4× the straight line,
 * and a motorbike averages about 20 km/h in barangay traffic.
 */
export function estimateMinutes(km: number): number {
  return Math.max(2, Math.round(((km * 1.4) / 20) * 60));
}
