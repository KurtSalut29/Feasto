"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { LatLng } from "@/lib/geo";

/**
 * The full map pages: the map fills the space between the top bar and the bottom tabs, with
 * its own controls floating on top. The phone column is at most 440px wide, like the rest of the app.
 */
export function FullMapFrame({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-10 mx-auto max-w-[440px] overflow-hidden">
      {children}
    </div>
  );
}

/** A round white button floating on the map. */
export function MapButton({ label, Icon, onClick, busy, active }: { label: string; Icon: LucideIcon; onClick: () => void; busy?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex size-11 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/5 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 ${
        active ? "text-sky-600" : "text-ink"
      }`}
    >
      {busy ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
    </button>
  );
}

/** The phone's position, asked for only when the person taps "Locate me". */
export function useLocateMe() {
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();

  function locate() {
    if (!("geolocation" in navigator)) return setError("This device can't share its location.");
    setLocating(true);
    setError(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setMe({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("Location is blocked. Allow it in your browser settings.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return { me, locate, locating, error };
}
