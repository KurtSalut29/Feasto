"use client";

import { LocateFixed, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGeolocation } from "@/components/map/use-my-location";
import { apiRequest } from "@/lib/api-client";
import type { LatLng } from "@/lib/geo";

const SEND_EVERY_MS = 4000;
const DEMO_STEPS = 15;

/** Fired with each demo position so the rider's own map can show it too. */
export const SIMULATED_POSITION_EVENT = "feasto:simulated-position";

/**
 * While the rider is delivering, sends the phone's GPS position every few seconds.
 * For demos on a laptop without GPS there's a "simulate" mode that moves a point from
 * the store to the customer (or a short ride in Naval when they have no pins).
 */
export function LocationSharer({ orderId, from, to }: { orderId: string; from: LatLng | null; to: LatLng | null }) {
  const [mode, setMode] = useState<"gps" | "simulated">("gps");
  // What happened to the last position sent: shared, or the server's reason for refusing it
  const [sent, setSent] = useState<string | null>(null);
  const gps = useGeolocation();
  const lastSent = useRef(0);

  // Each new GPS position is sent, at most every few seconds
  useEffect(() => {
    if (mode !== "gps" || !gps.position) return;
    if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = Date.now();
    void apiRequest("/rider/location", { method: "POST", body: { orderId, ...gps.position } }).then((result) =>
      setSent(result.ok ? "Sharing your live location with the customer" : result.error),
    );
  }, [mode, gps.position, orderId]);

  const status =
    mode === "simulated"
      ? (sent ?? "Starting the demo route…")
      : gps.error === "unsupported"
        ? "This device has no location. Use the demo route below."
        : gps.error === "blocked"
          ? "Location is blocked. Allow it in your browser, or use the demo route."
          : (sent ?? "Starting location…");

  useEffect(() => {
    if (mode !== "simulated") return;
    // From the store to the customer in even steps; without pins, a short ride east from Naval Port
    let step = 0;
    const start = from ?? { lat: 11.5588, lng: 124.3923 };
    const end = to && from ? to : { lat: start.lat + DEMO_STEPS * 0.0001, lng: start.lng + DEMO_STEPS * 0.0006 };
    const send = async () => {
      const t = Math.min(step / DEMO_STEPS, 1);
      const point = { lat: start.lat + (end.lat - start.lat) * t, lng: start.lng + (end.lng - start.lng) * t };
      step++;
      window.dispatchEvent(new CustomEvent(SIMULATED_POSITION_EVENT, { detail: point }));
      const result = await apiRequest("/rider/location", { method: "POST", body: { orderId, ...point } });
      setSent(result.ok ? `Demo route: sent point ${step}` : result.error);
    };
    void send();
    const timer = setInterval(send, SEND_EVERY_MS);
    return () => clearInterval(timer);
    // from/to are fixed for one delivery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, orderId]);

  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        <LocateFixed className="size-4 text-emerald-600" aria-hidden />
        {status}
      </p>
      {mode !== "simulated" && (
        <button
          type="button"
          onClick={() => setMode("simulated")}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <Route className="size-4" aria-hidden />
          Demo: simulate movement
        </button>
      )}
    </div>
  );
}
