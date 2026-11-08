"use client";

import { LocateFixed, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRoute } from "@/components/map/map-engine";
import { setDemoPosition, useGeolocation } from "@/components/map/use-my-location";
import { apiRequest } from "@/lib/api-client";
import { distanceKm, formatDistance, pathKm, pointAlong, type LatLng } from "@/lib/geo";

/** How often the phone's real GPS position is sent */
const SEND_EVERY_MS = 3000;
/** The demo ride: how often its position is sent, how fast it goes, and how far it may start from the store */
const DEMO_SEND_MS = 2000;
const DEMO_SPEED_MPS = 12;
const MAX_DEMO_KM = 3;

/**
 * From accepting a job until it's delivered, sends the phone's GPS position every few seconds,
 * so the customer watches the rider head to the store, then to their door.
 *
 * For demos on a laptop without GPS there's a "simulate" mode: it rides to the store first
 * (from where the rider is, or a few streets away), then from the store to the customer once
 * the order is picked up. The simulated spot stands in for the GPS everywhere on the page, so
 * the rider's own map and the in-app directions move with it.
 */
export function LocationSharer({ orderId, heading, store, home }: { orderId: string; heading: "store" | "home"; store: LatLng | null; home: LatLng | null }) {
  const [mode, setMode] = useState<"gps" | "simulated">("gps");
  // What happened to the last position sent: shared, or the server's reason for refusing it
  const [sent, setSent] = useState<string | null>(null);
  const gps = useGeolocation();
  const lastSent = useRef(0);
  const here = useRef(gps.position);
  useEffect(() => {
    here.current = gps.position;
  }, [gps.position]);

  const sharing = heading === "store" ? "Sharing your live location while you head to the store" : "Sharing your live location with the customer";

  // Each new GPS position is sent, at most every few seconds
  useEffect(() => {
    if (mode !== "gps" || !gps.position) return;
    if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = Date.now();
    void apiRequest("/rider/location", { method: "POST", body: { orderId, ...gps.position } }).then((result) => setSent(result.ok ? sharing : result.error));
  }, [mode, gps.position, orderId, sharing]);

  // The demo ride: along the roads to the store before pickup, then on to the customer.
  // The spot moves every second (the maps glide between them); the customer gets one every 2 s.
  useEffect(() => {
    if (mode !== "simulated") return;
    const fallback = { lat: 11.5588, lng: 124.3923 }; // Naval Port
    const nearStore = store ? { lat: store.lat - 0.004, lng: store.lng - 0.003 } : fallback;
    const now = here.current;
    const start =
      heading === "home"
        ? (store ?? now ?? fallback)
        : // A laptop's real location can be in another town; then start a few streets from the store
          now && store && distanceKm(now, store) < MAX_DEMO_KM
          ? now
          : nearStore;
    const end = (heading === "store" ? store : home) ?? { lat: start.lat + 0.0015, lng: start.lng + 0.009 };
    const to = heading === "store" ? "the store" : "the customer";
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    void getRoute(start, end).then((route) => {
      if (cancelled) return;
      // The road route starts and ends on the nearest roads, so join it to the two spots
      const path = [start, ...route.line.map(([lng, lat]) => ({ lat, lng })), end];
      const km = pathKm(path);
      const seconds = Math.min(Math.max((km * 1000) / DEMO_SPEED_MPS, 20), 75);
      const began = Date.now();
      let sentAt = 0;
      const tick = () => {
        const done = Math.min((Date.now() - began) / 1000 / seconds, 1);
        const point = pointAlong(path, done);
        setDemoPosition(point);
        if (Date.now() - sentAt >= DEMO_SEND_MS || done === 1) {
          sentAt = Date.now();
          void apiRequest("/rider/location", { method: "POST", body: { orderId, ...point } }).then((result) =>
            setSent(
              !result.ok
                ? result.error
                : done === 1
                  ? `Demo ride: arrived at ${to}`
                  : `Demo ride to ${to}: ${formatDistance(km * (1 - done))} to go`,
            ),
          );
        }
        if (done === 1) clearInterval(timer);
      };
      tick();
      timer = setInterval(tick, 1000);
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // store/home are fixed for one delivery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, orderId, heading]);

  // The demo spot belongs to this delivery; leaving it hands the map back to the real GPS
  useEffect(() => {
    if (mode !== "simulated") return;
    return () => setDemoPosition(null);
  }, [mode]);

  const status =
    mode === "simulated"
      ? (sent ?? "Starting the demo ride…")
      : gps.error === "unsupported"
        ? "This device has no location. Use the demo ride below."
        : gps.error === "blocked"
          ? "Location is blocked. Allow it in your browser so the customer can follow you, or use the demo ride."
          : (sent ?? "Starting location…");

  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ink" aria-live="polite">
        <LocateFixed className="size-4 shrink-0 text-emerald-600" aria-hidden />
        {status}
      </p>
      {mode !== "simulated" && (
        <button type="button" onClick={() => setMode("simulated")} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <Route className="size-4" aria-hidden />
          Demo: simulate the ride
        </button>
      )}
    </div>
  );
}
