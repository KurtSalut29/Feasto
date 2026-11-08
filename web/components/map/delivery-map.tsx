"use client";

import { Clock, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDistance, type LatLng } from "@/lib/geo";
import { FeastoMap, type MapPin } from "./feasto-map";
import type { Route } from "./map-engine";
import { useAddressPin } from "./use-address-pin";

/**
 * One delivery on a map: the store, the customer's home and the rider, with the way the
 * rider still has to go (to the store before pickup, to the customer after). A home saved
 * without a map pin is placed from its address, and the map says so.
 */
export function DeliveryMap({
  store,
  home,
  homeAddress,
  rider,
  heading,
  destination = "the customer",
  label,
  status,
}: {
  store: LatLng | null;
  home: LatLng | null;
  /** Used to find the home on the map when it has no pin */
  homeAddress?: string | null;
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
  const resolved = useAddressPin(home, homeAddress, store);
  const homeAt = resolved.at;
  const target = heading === "store" ? store : heading === "home" ? homeAt : null;
  const from = rider ?? (heading === "home" ? store : null);

  const pins: MapPin[] = [
    ...(store ? [{ id: "store", kind: "store" as const, at: store }] : []),
    ...(homeAt ? [{ id: "home", kind: "home" as const, at: homeAt }] : []),
    ...(rider ? [{ id: "rider", kind: "rider" as const, at: rider }] : []),
  ];
  if (pins.length === 0) return null;
  const noHome = !homeAt && !resolved.searching && heading === "home";

  return (
    <section className="overflow-hidden rounded-2xl border border-line">
      <FeastoMap pins={pins} route={from && target ? { from, to: target } : null} onRoute={setRoute} label={label} className="h-60" />
      <div className="space-y-0.5 border-t border-line px-4 py-3 text-sm empty:hidden">
        {route && from && target && (
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Clock className="size-4 text-brand-600" aria-hidden />
            About {route.minutes} min · {formatDistance(route.km)} to {heading === "store" ? "the store" : destination}
          </p>
        )}
        {(resolved.approximate || noHome) && (
          <p className="flex items-start gap-2 text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {noHome
              ? "This address has no map pin and couldn't be found on the map. Call the customer for directions."
              : destination === "you"
                ? "Your spot is approximate, found from your address. Pin it on the map in Addresses for exact tracking."
                : "The customer's spot is approximate, found from the address. Call them if you can't find it."}
          </p>
        )}
        {status && <div className="text-muted">{status}</div>}
      </div>
    </section>
  );
}
