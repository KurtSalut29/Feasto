"use client";

import { useSyncExternalStore } from "react";
import type { LatLng } from "@/lib/geo";

/**
 * The phone's GPS, shared by everything on the page. One watchPosition serves every component
 * (the map and the location sharer on the rider's delivery screen both need it); a second,
 * later watch can miss positions on some browsers, so there is only ever one.
 *
 * For demos without moving around, a position can be set by hand. It replaces the GPS on this
 * tab until it's cleared, for everything that uses this hook.
 */
type GeoState = { position: LatLng | null; error: "unsupported" | "blocked" | null; simulated?: boolean };

const NONE: GeoState = { position: null, error: null };
const DEMO_KEY = "feasto:demo-position";
let gps: GeoState = NONE;
let state: GeoState = NONE;
let simulated: LatLng | null = null;
let watchId: number | null = null;
const listeners = new Set<() => void>();
const publish = () => {
  state = simulated ? { position: simulated, error: null, simulated: true } : gps;
  listeners.forEach((listener) => listener());
};
const changed = (next: GeoState) => {
  gps = next;
  publish();
};

/** Pretend the phone is here (or go back to the real GPS with null). */
export function setDemoPosition(at: LatLng | null) {
  simulated = at;
  try {
    if (at) sessionStorage.setItem(DEMO_KEY, JSON.stringify(at));
    else sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // Storage can be blocked; the position still applies until the page reloads
  }
  publish();
}

function loadDemoPosition() {
  try {
    const saved = sessionStorage.getItem(DEMO_KEY);
    if (saved) simulated = JSON.parse(saved) as LatLng;
  } catch {
    simulated = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    loadDemoPosition();
    if (!("geolocation" in navigator)) gps = { position: null, error: "unsupported" };
    else
      watchId = navigator.geolocation.watchPosition(
        (p) => changed({ position: { lat: p.coords.latitude, lng: p.coords.longitude }, error: null }),
        () => changed({ ...gps, error: "blocked" }),
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    state = simulated ? { position: simulated, error: null, simulated: true } : gps;
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
