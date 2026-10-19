"use client";

import { LocateFixed, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api-client";

const SEND_EVERY_MS = 4000;

/**
 * While the rider is delivering, sends the phone's GPS position every few seconds.
 * For demos on a laptop without GPS there's a "simulate" mode that moves a point
 * along a short route in Quezon City.
 */
export function LocationSharer({ orderId }: { orderId: string }) {
  const [mode, setMode] = useState<"gps" | "simulated" | "off">("gps");
  const [status, setStatus] = useState("Starting location…");
  const lastSent = useRef(0);

  useEffect(() => {
    if (mode !== "gps") return;
    if (!("geolocation" in navigator)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("This device has no location. Use the demo route below.");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      async (position) => {
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        const result = await apiRequest("/rider/location", {
          method: "POST",
          body: { orderId, lat: position.coords.latitude, lng: position.coords.longitude },
        });
        setStatus(result.ok ? "Sharing your live location with the customer" : result.error);
      },
      () => setStatus("Location is blocked. Allow it in your browser, or use the demo route."),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [mode, orderId]);

  useEffect(() => {
    if (mode !== "simulated") return;
    // A short walk along Timog Avenue, Quezon City
    let step = 0;
    const start = { lat: 14.6345, lng: 121.0335 };
    const send = async () => {
      const point = { lat: start.lat - step * 0.0004, lng: start.lng + step * 0.0006 };
      step++;
      const result = await apiRequest("/rider/location", { method: "POST", body: { orderId, ...point } });
      setStatus(result.ok ? `Demo route: sent point ${step}` : result.error);
    };
    void send();
    const timer = setInterval(send, SEND_EVERY_MS);
    return () => clearInterval(timer);
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
