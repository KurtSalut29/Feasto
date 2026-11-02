"use client";

import { useState } from "react";
import { DeliveryMap } from "@/components/map/delivery-map";
import { timeAgo } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import { useLiveEvent } from "./live-updates";

type Point = { lat: number; lng: number; at: string };

/**
 * The resident's map of their delivery: the store, their home, and the rider once the food
 * is picked up. The rider's phone sends its position every few seconds; the API copy that
 * receives it publishes it on Redis, and the copy holding this page's live connection
 * forwards it here, so the rider moves without reloading.
 */
export function RiderTracking({
  orderId,
  initial,
  store,
  home,
  pickedUp,
}: {
  orderId: string;
  initial: Point | null;
  store: LatLng | null;
  home: LatLng | null;
  pickedUp: boolean;
}) {
  const [point, setPoint] = useState<Point | null>(initial);

  useLiveEvent((event) => {
    if (event.type === "rider.location" && event.orderId === orderId) setPoint({ lat: event.lat, lng: event.lng, at: event.at });
  });

  const rider = pickedUp && point ? { lat: point.lat, lng: point.lng } : null;
  return (
    <DeliveryMap
      store={store}
      home={home}
      rider={rider}
      heading={pickedUp ? "home" : null}
      destination="you"
      label="Map of your delivery: the store, your home and the rider"
      status={
        !pickedUp ? (
          "You'll see the rider here once they pick up your food."
        ) : point ? (
          <>
            Rider&apos;s location, updated{" "}
            {/* The minute can tick over between the server's render and the browser's */}
            <time dateTime={point.at} className="font-medium text-ink" suppressHydrationWarning>
              {timeAgo(point.at)}
            </time>
          </>
        ) : (
          "Waiting for the rider's location…"
        )
      }
    />
  );
}
