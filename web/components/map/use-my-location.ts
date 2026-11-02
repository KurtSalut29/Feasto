"use client";

import { useSyncExternalStore } from "react";
import type { LatLng } from "@/lib/geo";

/**
 * The phone's GPS, shared by everything on the page. One watchPosition serves every component
 * (the map and the location sharer on the rider's delivery screen both need it); a second,
 * later watch can miss positions on some browsers, so there is only ever one.
 */
type GeoState = { position: LatLng | null; error: "unsupported" | "blocked" | null };

const NONE: GeoState = { position: null, error: null };
let state: GeoState = NONE;
let watchId: number | null = null;
const listeners = new Set<() => void>();
const changed = (next: GeoState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (!("geolocation" in navigator)) state = { position: null, error: "unsupported" };
    else
      watchId = navigator.geolocation.watchPosition(
        (p) => changed({ position: { lat: p.coords.latitude, lng: p.coords.longitude }, error: null }),
        () => changed({ ...state, error: "blocked" }),
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  };
}

/** The latest position and whether location is unavailable. */
export function useGeolocation(): GeoState {
  return useSyncExternalStore(subscribe, () => state, () => NONE);
}

/** The phone's position while this page is open, or null without permission or GPS. */
export function useMyLocation(): LatLng | null {
  return useGeolocation().position;
}
