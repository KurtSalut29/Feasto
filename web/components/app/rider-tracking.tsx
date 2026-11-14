"use client";

import { Bike, Phone, Star } from "lucide-react";
import { useState } from "react";
import { DeliveryMap } from "@/components/map/delivery-map";
import { timeAgo } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import { useLiveEvent } from "./live-updates";

type Point = { lat: number; lng: number; at: string };
type Rider = { name: string; phone: string | null; vehicle: string | null; /** Residents' average, null before the first rating */ rating?: number | null };

/**
 * The resident's view of their delivery: who the rider is, what they're doing, and a map with
 * the rider moving, first toward the store, then toward the resident once the food is picked
 * up. The rider's phone sends its position every few seconds; the API copy that receives it
 * publishes it on Redis, and the copy holding this page's live connection forwards it here.
 */
export function RiderTracking({
  orderId,
  initial,
  store,
  storeName,
  home,
  homeAddress,
  rider,
  pickedUp,
}: {
  orderId: string;
  initial: Point | null;
  store: LatLng | null;
  storeName: string;
  home: LatLng | null;
  homeAddress: string | null;
  rider: Rider | null;
  pickedUp: boolean;
}) {
  const [point, setPoint] = useState<Point | null>(initial);

  useLiveEvent((event) => {
    if (event.type === "rider.location" && event.orderId === orderId) setPoint({ lat: event.lat, lng: event.lng, at: event.at });
  });

  const first = rider?.name.split(" ")[0];
  const doing = !rider
    ? `Finding a rider near ${storeName}…`
    : pickedUp
      ? `${first} picked up your food and is on the way to you.`
      : `${first} is heading to ${storeName} to pick up your food.`;

  return (
    <section aria-label="Your rider" className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-3 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden>
          {rider ? <span className="text-sm font-bold">{initials(rider.name)}</span> : <Bike className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Your rider</p>
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <span className="truncate">{rider ? rider.name : "Not assigned yet"}</span>
            {rider?.rating != null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[0.8125rem] font-semibold">
                <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {rider.rating.toFixed(1)}
                <span className="sr-only"> out of 5 from residents</span>
              </span>
            )}
          </p>
          {rider?.vehicle && <p className="truncate text-sm text-muted">{rider.vehicle}</p>}
        </div>
        {rider?.phone && (
          <a
            href={`tel:${rider.phone}`}
            aria-label={`Call ${rider.name}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <Phone className="size-4" aria-hidden />
          </a>
        )}
      </div>
      <p className="flex items-center gap-2 border-t border-line bg-brand-50/60 px-4 py-2.5 text-sm font-semibold text-brand-700" aria-live="polite">
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
        </span>
        {doing}
      </p>
      <div className="border-t border-line [&>section]:rounded-none [&>section]:border-0">
        <DeliveryMap
          store={store}
          home={home}
          homeAddress={homeAddress}
          rider={rider && point ? { lat: point.lat, lng: point.lng } : null}
          heading={rider ? (pickedUp ? "home" : "store") : null}
          destination="you"
          label={pickedUp ? "Map of your delivery: the rider on the way to you" : "Map of your delivery: the rider on the way to the store"}
          status={
            !rider ? (
              "You'll see the rider here as soon as one accepts your delivery."
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
      </div>
    </section>
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
