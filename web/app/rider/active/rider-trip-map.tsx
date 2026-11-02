"use client";

import { useEffect, useState } from "react";
import { DeliveryMap } from "@/components/map/delivery-map";
import { useMyLocation } from "@/components/map/use-my-location";
import type { LatLng } from "@/lib/geo";
import type { OrderStatus } from "@/lib/types";
import { SIMULATED_POSITION_EVENT } from "./location-sharer";

/** The rider's own map of the current delivery: their GPS (or the demo route) moving toward the next stop. */
export function RiderTripMap({ store, home, status }: { store: LatLng | null; home: LatLng | null; status: OrderStatus }) {
  const gps = useMyLocation();
  const [simulated, setSimulated] = useState<LatLng | null>(null);

  useEffect(() => {
    const onSimulated = (event: Event) => setSimulated((event as CustomEvent<LatLng>).detail);
    window.addEventListener(SIMULATED_POSITION_EVENT, onSimulated);
    return () => window.removeEventListener(SIMULATED_POSITION_EVENT, onSimulated);
  }, []);

  return (
    <DeliveryMap
      store={store}
      home={home}
      rider={simulated ?? gps}
      heading={status === "PICKED_UP" ? "home" : "store"}
      label="Map of your delivery: the store, the customer and you"
      status={!gps && !simulated ? "Allow location to see yourself on the map." : undefined}
    />
  );
}
