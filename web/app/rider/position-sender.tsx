"use client";

import { useEffect, useRef } from "react";
import { useGeolocation } from "@/components/map/use-my-location";
import { apiRequest } from "@/lib/api-client";

const SEND_EVERY_MS = 15_000;

/**
 * While the rider is online, tells Feasto where they are, so a job can reach the riders
 * nearest the store first. Shows nothing. Phones usually stop this when the app is closed,
 * so such riders simply get jobs later, when they open to every free rider.
 */
export function PositionSender() {
  const { position, simulated } = useGeolocation();
  const latest = useRef(position);
  useEffect(() => {
    latest.current = position;
  }, [position]);

  const send = () => {
    if (latest.current) void apiRequest("/rider/position", { method: "POST", body: latest.current });
  };

  // Right away once the position is known, then regularly so it stays recent
  const known = Boolean(position);
  useEffect(() => {
    if (!known) return;
    send();
    const timer = setInterval(send, SEND_EVERY_MS);
    return () => clearInterval(timer);
  }, [known]);

  // A demo move shouldn't wait for the next regular send
  useEffect(() => {
    if (simulated) send();
  }, [simulated, position?.lat, position?.lng]);

  return null;
}
