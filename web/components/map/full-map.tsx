"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { LatLng } from "@/lib/geo";

/**
 * The full map pages: the map fills the space between the top bar and the bottom tabs, with
 * its own controls floating on top. On phones it's the 440px app column. From tablets up the
 * resident's map fills the screen under the top navigation; from laptops up the rider's fills
 * the space beside the sidebar, as a rounded panel.
 */
export function FullMapFrame({ children, role = "RESIDENT" }: { children: ReactNode; role?: "RESIDENT" | "RIDER" }) {
  const big =
    role === "RESIDENT"
      ? "md:top-[calc(4rem+1px)] md:bottom-0 md:max-w-none"
      : "md:max-w-2xl lg:inset-x-auto lg:top-[5.25rem] lg:right-10 lg:bottom-6 lg:left-[312px] lg:mx-0 lg:max-w-none lg:rounded-3xl lg:ring-1 lg:ring-line lg:collapsed:left-[132px]";
  return (
    <div className={`fixed inset-x-0 top-[calc(3.5rem+1px+env(safe-area-inset-top))] bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-10 mx-auto max-w-[440px] overflow-hidden ${big}`}>
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
