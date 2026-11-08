"use client";

import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  LocateFixed,
  Navigation,
  RotateCw,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatDistance, type LatLng } from "@/lib/geo";
import { FeastoMap, type MapPin } from "./feasto-map";
import type { Route, RouteStep } from "./map-engine";
import { useAddressPin } from "./use-address-pin";
import { useGeolocation } from "./use-my-location";

type Destination = { at: LatLng | null; name: string; address?: string; kind?: "store" | "home"; near?: LatLng | null };

/**
 * Directions inside Feasto: opens a full-screen map with the way from where you are to the
 * place, how long it takes, and each turn. It follows you as you move, so it never sends
 * anyone out to another maps app.
 */
export function DirectionsButton({
  to,
  name,
  address,
  kind = "store",
  near,
  className,
  children,
}: {
  /** The place's pin; without one, it's found from the address */
  to: LatLng | null;
  /** Where to look for an address without a pin, e.g. the store */
  near?: LatLng | null;
  name: string;
  address?: string;
  kind?: "store" | "home";
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Directions to ${name}`} className={className}>
        {children ?? (
          <>
            <Navigation className="size-4 text-brand-600" aria-hidden />
            Directions
          </>
        )}
      </button>
      {open && createPortal(<DirectionsView destination={{ at: to, name, address, kind, near }} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

const TURN_ICON: Record<string, LucideIcon> = {
  left: CornerUpLeft,
  "sharp left": CornerUpLeft,
  "slight left": ArrowUpLeft,
  right: CornerUpRight,
  "sharp right": CornerUpRight,
  "slight right": ArrowUpRight,
  uturn: Undo2,
  straight: ArrowUp,
};

function stepIcon(step: RouteStep): LucideIcon {
  if (step.kind === "arrive") return Flag;
  if (step.kind === "depart") return Navigation;
  if (step.kind === "roundabout" || step.kind === "rotary" || step.kind === "roundabout turn") return RotateCw;
  return TURN_ICON[step.modifier ?? "straight"] ?? ArrowUp;
}

function DirectionsView({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const { position, error } = useGeolocation();
  const [route, setRoute] = useState<Route | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const place = useAddressPin(destination.at, destination.address, destination.near);

  // Full screen over the app: Esc closes it, the page behind doesn't scroll
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  const pins: MapPin[] = [
    ...(place.at ? [{ id: "destination", kind: destination.kind ?? "store", at: place.at, label: destination.name }] : []),
    ...(position ? [{ id: "me", kind: "me" as const, at: position }] : []),
  ];
  const shownRoute = position && place.at && route ? route : null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="directions-title" className="fixed inset-0 z-[70] flex flex-col bg-white">
      <div className="flex items-start gap-3 border-b border-line px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Close directions"
          className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">Directions to</p>
          <h2 id="directions-title" className="truncate text-lg leading-tight font-bold text-ink">
            {destination.name}
          </h2>
          {destination.address && <p className="truncate text-sm text-muted">{destination.address}</p>}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* Drawn once the place is known, so the map opens framed on both you and it */}
        {place.searching ? (
          <div aria-hidden className="absolute inset-0 animate-pulse bg-gray-200/70" />
        ) : (
          <FeastoMap
            pins={pins}
            route={position && place.at ? { from: position, to: place.at } : null}
            onRoute={setRoute}
            label={`Map with the way to ${destination.name}`}
            className="h-full"
            expandable={false}
          />
        )}
      </div>

      <div className="h-[42dvh] shrink-0 overflow-y-auto border-t border-line pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_24px_-18px_rgba(31,45,61,0.4)]">
        {place.approximate && (
          <p className="flex items-start gap-2 border-b border-line bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            No map pin was saved for this address, so the spot is found from the address and may be off a little.
          </p>
        )}
        {!place.at ? (
          <p className="flex items-start gap-2 px-4 py-4 text-sm text-muted">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
            {place.searching
              ? "Looking for this address on the map…"
              : "This address has no map pin and couldn't be found on the map. Call them for directions."}
          </p>
        ) : !position ? (
          <p className="flex items-start gap-2 px-4 py-4 text-sm text-muted">
            <LocateFixed className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
            {error === "blocked"
              ? "Location is blocked. Allow it in your browser to see the way from where you are."
              : error === "unsupported"
                ? "This device can't share its location, so only the place is shown."
                : "Finding where you are…"}
          </p>
        ) : !shownRoute ? (
          <p className="px-4 py-4 text-sm text-muted">Finding the way…</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 px-4 pt-4" aria-live="polite">
              <p className="text-2xl font-bold text-ink tabular-nums">{shownRoute.minutes} min</p>
              <p className="text-sm text-muted">
                {formatDistance(shownRoute.km)} · {shownRoute.roads ? "by road, from where you are" : "straight line, follow the roads"}
              </p>
            </div>
            {shownRoute.steps.length > 0 && (
              <ol className="mt-2 divide-y divide-line px-4 pb-4" aria-label="Turn by turn">
                {shownRoute.steps.map((step, i) => {
                  const Icon = stepIcon(step);
                  return (
                    <li key={i} className="flex items-center gap-3 py-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-ink">{step.text}</span>
                      {step.km > 0 && <span className="shrink-0 text-xs text-muted tabular-nums">{formatDistance(step.km)}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
            {shownRoute.steps.length === 0 && <div className="h-4" />}
          </>
        )}
      </div>
    </div>
  );
}
