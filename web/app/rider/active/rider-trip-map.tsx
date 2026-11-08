"use client";

import { DeliveryMap } from "@/components/map/delivery-map";
import { useMyLocation } from "@/components/map/use-my-location";
import type { LatLng } from "@/lib/geo";
import type { OrderStatus } from "@/lib/types";

/**
 * The rider's own map of the current delivery: where they are (GPS, or the demo ride) and the
 * way to the next stop, the store before pickup and the customer after, redrawn as they move.
 */
export function RiderTripMap({
  store,
  home,
  homeAddress,
  status,
}: {
  store: LatLng | null;
  home: LatLng | null;
  homeAddress: string | null;
  status: OrderStatus;
}) {
  const me = useMyLocation();
  const toCustomer = status === "PICKED_UP";
  return (
    <DeliveryMap
      store={store}
      home={home}
      homeAddress={homeAddress}
      rider={me}
      heading={toCustomer ? "home" : "store"}
      label={toCustomer ? "Map of your way to the customer" : "Map of your way to the store"}
      status={!me ? "Allow location to see yourself and the way on the map." : undefined}
    />
  );
}
