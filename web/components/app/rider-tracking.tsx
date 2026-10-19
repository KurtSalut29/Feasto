"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import { useLiveEvent } from "./live-updates";

type Point = { lat: number; lng: number; at: string };

/**
 * Live map of the rider. The rider's phone sends its position every few seconds;
 * the API copy that receives it publishes it on Redis, and the copy holding this
 * page's live connection forwards it here, so the marker moves without reloading.
 */
export function RiderTracking({ orderId, initial }: { orderId: string; initial: Point | null }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [point, setPoint] = useState<Point | null>(initial);

  useLiveEvent((event) => {
    if (event.type === "rider.location" && event.orderId === orderId) setPoint({ lat: event.lat, lng: event.lng, at: event.at });
  });

  // Create the map once (Leaflet needs the browser, so it's loaded here)
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || map.current) return;
      map.current = L.map(container.current, { zoomControl: false, attributionControl: true }).setView(
        point ? [point.lat, point.lng] : [14.6507, 121.0494], // Quezon City until the rider's position arrives
        16,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map.current);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; position updates are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move the marker whenever a new position arrives
  useEffect(() => {
    if (!point) return;
    void import("leaflet").then((L) => {
      if (!map.current) return;
      const at: [number, number] = [point.lat, point.lng];
      if (!marker.current) {
        const icon = L.divIcon({
          className: "",
          html: '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#d24600;border:3px solid #fff;box-shadow:0 0 0 6px rgba(254,85,2,.25)"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        marker.current = L.marker(at, { icon, title: "Rider" }).addTo(map.current);
      } else {
        marker.current.setLatLng(at);
      }
      map.current.panTo(at);
    });
  }, [point]);

  return (
    <section className="overflow-hidden rounded-2xl border border-line">
      <div ref={container} className="h-56 w-full bg-canvas" role="img" aria-label="Map showing the rider's location" />
      <div className="flex items-center gap-2 px-4 py-3 text-sm">
        <Navigation className="size-4 text-brand-600" aria-hidden />
        {point ? (
          <span className="text-ink">
            Rider&apos;s location, updated <span className="font-medium">{timeAgo(point.at)}</span>
          </span>
        ) : (
          <span className="text-muted">Waiting for the rider&apos;s location…</span>
        )}
      </div>
    </section>
  );
}
