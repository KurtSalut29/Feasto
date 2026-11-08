"use client";

import { Phone } from "lucide-react";
import { useState } from "react";
import { useLiveEvent } from "@/components/app/live-updates";
import { DeliveryMap } from "@/components/map/delivery-map";
import { timeAgo } from "@/lib/format";
import { distanceKm, estimateMinutes, formatDistance, type LatLng } from "@/lib/geo";
import type { OrderStatus } from "@/lib/types";

type Point = { lat: number; lng: number; at: string };
type Rider = { name: string; phone: string | null; riderProfile?: { vehicleModel: string | null; plateNumber: string | null } | null };

/** Closer than this, the rider is at the store */
const AT_STORE_KM = 0.06;

/**
 * The rider on one of the store's orders, live: who they are, and how far they are from the
 * store (before pickup) or from the customer (after). Positions arrive every few seconds from
 * the rider's phone. With `map`, a live map of the trip sits under it.
 */
export function RiderLive({
  orderId,
  rider,
  initial,
  status,
  store,
  home,
  homeAddress,
  map = false,
}: {
  orderId: string;
  rider: Rider;
  initial: Point | null;
  status: OrderStatus;
  store: LatLng | null;
  home: LatLng | null;
  homeAddress?: string | null;
  map?: boolean;
}) {
  const [point, setPoint] = useState<Point | null>(initial);
  useLiveEvent((event) => {
    if (event.type === "rider.location" && event.orderId === orderId) setPoint({ lat: event.lat, lng: event.lng, at: event.at });
  });

  const first = rider.name.split(" ")[0];
  const pickedUp = status === "PICKED_UP";
  const finished = status === "DELIVERED" || status === "COMPLETED";
  const at = point ? { lat: point.lat, lng: point.lng } : null;
  const target = pickedUp ? home : store;
  const km = at && target ? distanceKm(at, target) : null;

  // With the map, its road route gives the time and distance; without it, a straight-line estimate
  const showDistance = !map && km !== null;
  let line: string;
  if (finished) line = `${first} delivered this order`;
  else if (!at) line = `Waiting for ${first}'s location…`;
  else if (pickedUp) line = showDistance ? `On the way to the customer · ${formatDistance(km!)} left` : "On the way to the customer";
  else if (km !== null && km < AT_STORE_KM) line = `${first} is at your store`;
  else if (showDistance) line = `About ${estimateMinutes(km!)} min away · ${formatDistance(km!)}`;
  else line = `${first} is on the way to your store`;

  const vehicle = rider.riderProfile ? [rider.riderProfile.vehicleModel ?? "Motorcycle", rider.riderProfile.plateNumber].filter(Boolean).join(" · ") : null;
  const live = !finished && Boolean(at);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>
          {initials(rider.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{rider.name}</p>
          {vehicle && <p className="truncate text-xs text-muted">{vehicle}</p>}
        </div>
        {rider.phone && (
          <a
            href={`tel:${rider.phone}`}
            aria-label={`Call ${rider.name}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <Phone className="size-4" aria-hidden />
          </a>
        )}
      </div>
      <p className={`flex items-center gap-2 text-[13px] font-semibold ${live ? "text-brand-700" : "text-muted"}`} aria-live="polite">
        {live && (
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
          </span>
        )}
        {line}
      </p>
      {map && !finished && (
        <DeliveryMap
          store={store}
          home={home}
          homeAddress={homeAddress}
          rider={at}
          heading={pickedUp ? "home" : "store"}
          destination="the customer"
          label={pickedUp ? "Map of the rider on the way to the customer" : "Map of the rider on the way to your store"}
          status={
            point ? (
              <>
                Location updated{" "}
                <time dateTime={point.at} className="font-medium text-ink" suppressHydrationWarning>
                  {timeAgo(point.at).toLowerCase()}
                </time>
              </>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
