import { z } from "zod";

/**
 * A pin on the map. Both numbers come together or not at all; null clears a saved pin.
 * Left out of a request, the saved pin stays as it is.
 */
export const pinFields = {
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
};

export const pinIsWhole = (v: { latitude?: number | null; longitude?: number | null }) =>
  (v.latitude == null) === (v.longitude == null);

export const PIN_MESSAGE = { path: ["latitude"], message: "Set the pin on the map again." };

/** Where to measure from, from a GET request's `lat` and `lng` (e.g. the rider's phone). */
export const nearQuery = {
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
};

/**
 * The part of the map on screen, as `west,south,east,north`. A map only asks for the pins it
 * can show, so a town with thousands of stores or jobs still sends a handful at a time.
 */
export const bboxQuery = z
  .string()
  .transform((value, ctx) => {
    const [west, south, east, north] = value.split(",").map(Number);
    const valid = [west, south, east, north].every(Number.isFinite) && west <= east && south <= north;
    if (!valid) {
      ctx.addIssue({ code: "custom", message: "Use west,south,east,north." });
      return z.NEVER;
    }
    return { west, south, east, north };
  })
  .optional();

export type Bbox = NonNullable<z.infer<typeof bboxQuery>>;
export type LatLng = { lat: number; lng: number };

export const inBbox = (box: Bbox, lat: number, lng: number) => lng >= box.west && lng <= box.east && lat >= box.south && lat <= box.north;

/** Straight-line distance in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** One page of a long list: `limit` rows after skipping `offset`. */
export const pageQuery = (defaultLimit: number, maxLimit: number) => ({
  limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Where the next page starts, or null on the last page. */
export const nextOffset = (offset: number, shown: number, total: number) => (offset + shown < total ? offset + shown : null);
