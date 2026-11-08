"use client";

import type { Map as MapInstance, Marker } from "maplibre-gl";
import { distanceKm, estimateMinutes, nearestOnPath, pathKm, type LatLng } from "@/lib/geo";

/**
 * Which map library draws the map. Mapbox when a token is set (nicest look, road routes,
 * address search); otherwise, or when Mapbox fails to load (no internet to Mapbox, a bad
 * token, the free limit reached), the free OpenFreeMap style drawn with MapLibre. The two
 * libraries share the same API for everything Feasto uses, so the rest of the code doesn't care.
 */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Liberty, not the plainer Positron, because it shows landmarks (schools, churches, the market)
const FALLBACK_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const LOAD_TIMEOUT_MS = 8000;

export type MapEngine = {
  map: MapInstance;
  /** Creates a marker with the same library that drew the map */
  marker: (element: HTMLElement) => Marker;
  provider: "mapbox" | "free";
};

type Options = { container: HTMLElement; center: LatLng; zoom: number; interactive?: boolean };

async function createMapbox({ container, center, zoom, interactive = true }: Options): Promise<MapEngine> {
  const lib = await import("mapbox-gl");
  const map = new lib.Map({
    container,
    accessToken: MAPBOX_TOKEN,
    style: "mapbox://styles/mapbox/standard",
    // Landmarks (schools, churches, the market, the port) help people find their way
    config: { basemap: { lightPreset: "day", showPointOfInterestLabels: true, showTransitLabels: true } },
    center: [center.lng, center.lat],
    zoom,
    interactive,
    attributionControl: false,
    pitchWithRotate: false,
  });
  map.addControl(new lib.AttributionControl({ compact: true }));
  await loaded(map as unknown as MapInstance);
  return {
    // Mapbox's Map has the same shape as MapLibre's for the calls Feasto makes
    map: map as unknown as MapInstance,
    marker: (element) => new lib.Marker({ element }) as unknown as Marker,
    provider: "mapbox",
  };
}

async function createFree({ container, center, zoom, interactive = true }: Options): Promise<MapEngine> {
  const lib = await import("maplibre-gl");
  const map = new lib.Map({
    container,
    style: FALLBACK_STYLE,
    center: [center.lng, center.lat],
    zoom,
    interactive,
    attributionControl: { compact: true },
    pitchWithRotate: false,
  });
  await loaded(map);
  return { map, marker: (element) => new lib.Marker({ element }), provider: "free" };
}

/** Resolves when the style has loaded; rejects on an early error or after a timeout. */
function loaded(map: MapInstance): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("map load timed out")), LOAD_TIMEOUT_MS);
    map.once("load", () => {
      clearTimeout(timer);
      resolve();
    });
    map.once("error", (event) => {
      clearTimeout(timer);
      reject(event.error ?? new Error("map error"));
    });
  });
}

/**
 * A fresh element to draw one map into. Each effect run gets its own, so when React runs an
 * effect twice in development, the two maps never share (and fight over) one element.
 */
export function mapHost(parent: HTMLElement): HTMLElement {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.inset = "0";
  parent.appendChild(host);
  return host;
}

/** Draws a map, trying Mapbox first when there is a token. */
export async function createMap(options: Options): Promise<MapEngine> {
  let engine: MapEngine | null = null;
  if (MAPBOX_TOKEN) {
    try {
      engine = await createMapbox(options);
    } catch (error) {
      console.warn("Mapbox didn't load, using the free map instead.", error);
      options.container.replaceChildren(); // clear what Mapbox left behind
    }
  }
  engine ??= await createFree(options);
  // The map credits are required, but on a phone-sized map they start folded into an (i) button
  for (const name of ["maplibregl-compact-show", "mapboxgl-compact-show"]) {
    options.container.querySelector(`.${name}`)?.classList.remove(name);
  }
  return engine;
}

export type Route = {
  /** [lng, lat] points along the route */
  line: [number, number][];
  km: number;
  minutes: number;
  /** True when it follows real roads (Mapbox Directions), false for a straight line */
  roads: boolean;
  /** Turn-by-turn steps ("Turn left onto Castin Street"), when the route follows roads */
  steps: RouteStep[];
};

export type RouteStep = { text: string; km: number; kind: string; modifier?: string };

const routeCache = new Map<string, Promise<Route>>();

/** A road route from Mapbox Directions, or a straight line with an estimate when that isn't available. */
export function getRoute(from: LatLng, to: LatLng): Promise<Route> {
  // Rounded to ~10 m so a rider's small GPS wobbles reuse the last answer
  const key = [from.lat, from.lng, to.lat, to.lng].map((n) => n.toFixed(4)).join(",");
  let route = routeCache.get(key);
  if (!route) {
    route = fetchRoute(from, to);
    routeCache.set(key, route);
  }
  return route;
}

async function fetchRoute(from: LatLng, to: LatLng): Promise<Route> {
  const straight = (): Route => {
    const km = distanceKm(from, to);
    return { line: [[from.lng, from.lat], [to.lng, to.lat]], km, minutes: estimateMinutes(km), roads: false, steps: [] };
  };
  if (!MAPBOX_TOKEN) return straight();
  try {
    const url =
      // Mapbox has no motorbike profile. "driving" (cars) avoids the small barangay streets riders
      // really use and sends them around one-way blocks; "cycling" follows those streets.
      `https://api.mapbox.com/directions/v5/mapbox/cycling/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?geometries=geojson&overview=full&steps=true&language=en&access_token=${MAPBOX_TOKEN}`;
    const response = await fetch(url);
    if (!response.ok) return straight();
    const data = (await response.json()) as {
      routes?: {
        geometry: { coordinates: [number, number][] };
        distance: number;
        duration: number;
        legs?: { steps?: { distance: number; maneuver: { instruction: string; type: string; modifier?: string } }[] }[];
      }[];
    };
    const best = data.routes?.[0];
    if (!best) return straight();
    const km = best.distance / 1000;
    // A road route over 3× the straight distance usually means a pin sits on a footpath or behind
    // a wall, so the detour is misleading; the straight guide and estimate are closer to the truth
    if (km > 3 * distanceKm(from, to) && km > 0.5) return straight();
    const steps = (best.legs ?? []).flatMap((leg) =>
      (leg.steps ?? []).map((step) => ({
        // The cycling profile says "Bike southwest…"; riders here are on motorbikes
        text: step.maneuver.instruction.replace(/^Bike\b/, "Head"),
        km: step.distance / 1000,
        kind: step.maneuver.type,
        modifier: step.maneuver.modifier,
      })),
    );
    return { line: best.geometry.coordinates, km, minutes: Math.max(1, Math.round(best.duration / 60)), roads: true, steps };
  } catch {
    return straight();
  }
}

/** How far off a route someone can be and still be on it (GPS wobble, the width of a road) */
const ON_ROUTE_KM = 0.04;

/**
 * The part of a route still ahead of someone at `at`, or null when they've left the route
 * (then it should be asked for again). Time and turns are cut down in step with the distance.
 */
export function trimRoute(route: Route, at: LatLng): Route | null {
  const path = route.line.map(([lng, lat]) => ({ lat, lng }));
  if (path.length < 2) return null;
  const { index, spot, offKm } = nearestOnPath(path, at);
  if (route.roads && offKm > ON_ROUTE_KM) return null;
  const ahead = [spot, ...path.slice(index + 1)];
  const km = pathKm(ahead);
  const done = route.km - km;
  let passed = 0;
  const steps = route.steps.filter((step) => {
    passed += step.km;
    return passed > done || step.kind === "arrive";
  });
  return {
    ...route,
    line: ahead.map((p) => [p.lng, p.lat] as [number, number]),
    km,
    minutes: Math.max(1, Math.round(route.minutes * (route.km ? km / route.km : 1))),
    steps,
  };
}

export type Place = { id: string; name: string; detail: string; at: LatLng };

const addressCache = new Map<string, Promise<LatLng | null>>();
/** How far from the store an address found by its text may be */
const NEAR_KM = 25;

/**
 * Where an address probably is, for an address saved without a map pin: the best match for its
 * text near a known spot (the store). Only the street part is searched, not the landmark after "·".
 * Null without Mapbox or when nothing matches.
 */
export function locateAddress(address: string, near: LatLng): Promise<LatLng | null> {
  const street = address.split(" · ")[0].trim();
  let found = addressCache.get(street);
  if (!found) {
    // The nearest match close to the store; a same-named street in another province is no help
    found = searchPlaces(street, near).then((places) => {
      const close = places.map((p) => ({ at: p.at, km: distanceKm(near, p.at) })).filter((p) => p.km <= NEAR_KM);
      close.sort((a, b) => a.km - b.km);
      return close[0]?.at ?? null;
    });
    addressCache.set(street, found);
  }
  return found;
}

/** Address suggestions near a point (Mapbox Geocoding). Empty without a token. */
export async function searchPlaces(query: string, near: LatLng): Promise<Place[]> {
  if (!MAPBOX_TOKEN || query.trim().length < 3) return [];
  const url =
    `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}` +
    `&country=ph&limit=5&proximity=${near.lng},${near.lat}&access_token=${MAPBOX_TOKEN}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      features?: { id: string; geometry: { coordinates: [number, number] }; properties: { name: string; place_formatted?: string } }[];
    };
    return (data.features ?? []).map((f) => ({
      id: f.id,
      name: f.properties.name,
      detail: f.properties.place_formatted ?? "",
      at: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
    }));
  } catch {
    return [];
  }
}
