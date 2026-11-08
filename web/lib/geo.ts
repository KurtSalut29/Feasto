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

/** Length of a path of points, in kilometres. */
export function pathKm(path: LatLng[]): number {
  let km = 0;
  for (let i = 1; i < path.length; i++) km += distanceKm(path[i - 1], path[i]);
  return km;
}

/** The point a fraction (0 to 1) of the way along a path, measured by distance. */
export function pointAlong(path: LatLng[], fraction: number): LatLng {
  if (path.length === 0) throw new Error("empty path");
  let left = Math.min(Math.max(fraction, 0), 1) * pathKm(path);
  for (let i = 1; i < path.length; i++) {
    const leg = distanceKm(path[i - 1], path[i]);
    if (left <= leg && leg > 0) {
      const t = left / leg;
      return { lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * t, lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * t };
    }
    left -= leg;
  }
  return path[path.length - 1];
}

/**
 * Where a point meets a path: the index of the segment it's nearest to, the nearest spot on
 * that segment, and how far off the path the point is (km). Flat maths, fine across a town.
 */
export function nearestOnPath(path: LatLng[], at: LatLng): { index: number; spot: LatLng; offKm: number } {
  const kx = 111.32 * Math.cos((at.lat * Math.PI) / 180);
  const ky = 110.57;
  let best = { index: 0, spot: path[0], offKm: Infinity };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * ky;
    const px = (at.lng - a.lng) * kx;
    const py = (at.lat - a.lat) * ky;
    const len = bx * bx + by * by;
    const t = len ? Math.min(Math.max((px * bx + py * by) / len, 0), 1) : 0;
    const off = Math.hypot(px - bx * t, py - by * t);
    if (off < best.offKm) best = { index: i - 1, spot: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }, offKm: off };
  }
  return best;
}
