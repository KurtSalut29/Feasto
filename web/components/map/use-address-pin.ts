"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CENTER, type LatLng } from "@/lib/geo";
import { locateAddress } from "./map-engine";

/**
 * A place's spot on the map: its pin when it has one; otherwise, found from its address text
 * (marked approximate), so a customer who never pinned their address still gets a route.
 * `searching` is true while the address is being looked up.
 */
export function useAddressPin(
  pin: LatLng | null,
  address: string | null | undefined,
  near?: LatLng | null,
): { at: LatLng | null; approximate: boolean; searching: boolean } {
  const [found, setFound] = useState<{ address: string; at: LatLng | null } | null>(null);
  const lookup = !pin && address ? address : null;

  useEffect(() => {
    if (!lookup) return;
    let cancelled = false;
    void locateAddress(lookup, near ?? DEFAULT_CENTER).then((at) => {
      if (!cancelled) setFound({ address: lookup, at });
    });
    return () => {
      cancelled = true;
    };
    // near only guides the search; the address decides it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  if (pin) return { at: pin, approximate: false, searching: false };
  if (!lookup) return { at: null, approximate: false, searching: false };
  const done = found?.address === lookup;
  const at = done ? found.at : null;
  return { at, approximate: Boolean(at), searching: !done };
}
