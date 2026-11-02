"use client";

import { Clock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDistance, type LatLng } from "@/lib/geo";
import { FeastoMap, type MapPin } from "./feasto-map";
import type { Route } from "./map-engine";

/**
 * One delivery on a map: the store, the customer's home and the rider, with the way the
 * rider still has to go (to the store before pickup, to the customer after).
 */
export function DeliveryMap({
  store,
  home,
  rider,
  heading,
  destination = "the customer",
  label,
  status,
}: {
  store: LatLng | null;
  home: LatLng | null;
  rider: LatLng | null;
  /** Where the rider is going next */
  heading: "store" | "home" | null;
  /** How the home is named in the time line: "the customer" for riders, "you" for residents */
  destination?: string;
  label: string;
  /** Line under the map, e.g. when the rider's position was last updated */
  status?: ReactNode;
}) {
  const [route, setRoute] = useState<Route | null>(null);
  const target = heading === "store" ? store : heading === "home" ? home : null;
  const from = rider ?? (heading === "home" ? store : null);

  const pins: MapPin[] = [
    ...(store ? [{ id: "store", kind: "store" as const, at: store }] : []),
    ...(home ? [{ id: "home", kind: "home" as const, at: home }] : []),
    ...(rider ? [{ id: "rider", kind: "rider" as const, at: rider }] : []),
  ];
  if (pins.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-line">
      <FeastoMap
        pins={pins}
        route={from && target ? { from, to: target } : null}
        onRoute={setRoute}
        label={label}
        className="h-60"
      />
      {(route || status) && (
        <div className="space-y-0.5 border-t border-line px-4 py-3 text-sm">
          {route && from && target && (
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Clock className="size-4 text-brand-600" aria-hidden />
              About {route.minutes} min · {formatDistance(route.km)} to {heading === "store" ? "the store" : destination}
            </p>
          )}
          {status && <div className="text-muted">{status}</div>}
        </div>
      )}
    </section>
  );
}
