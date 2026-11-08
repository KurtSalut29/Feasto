"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { House, MapPinOff, Maximize2, Store, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_CENTER, distanceKm, type LatLng } from "@/lib/geo";
import { createMap, getRoute, mapHost, trimRoute, type MapEngine, type Route } from "./map-engine";

export type MapPin = {
  id: string;
  kind: "store" | "home" | "rider" | "me";
  at: LatLng;
  /** Small text under the pin, e.g. a store name */
  label?: string;
  /** Faded, e.g. a closed store */
  muted?: boolean;
  /** Ringed, e.g. the pin someone tapped */
  selected?: boolean;
};

/** The part of the map on screen: `west,south,east,north`, as the API's bbox expects. */
export type MapView = { bbox: string; zoom: number };

const ROUTE_SOURCE = "feasto-route";

/**
 * A Feasto map: pins for stores, homes, the rider and "you", plus an optional route line.
 * Pins are React elements placed on the map, so they look like the rest of the app.
 * The expand button opens the same map full screen, keeping its pins and route.
 */
export function FeastoMap({
  pins,
  route,
  onRoute,
  onSelect,
  label,
  className = "h-56",
  interactive = true,
  start,
  focus,
  expandable = true,
  onView,
}: {
  pins: MapPin[];
  /** Draws the way between two points (by road when Mapbox is available) */
  route?: { from: LatLng; to: LatLng } | null;
  onRoute?: (route: Route) => void;
  /** Called with a pin's id when it's tapped */
  onSelect?: (id: string) => void;
  /** Read out by screen readers in place of the map */
  label: string;
  className?: string;
  interactive?: boolean;
  /** Where to look first. Without it the map frames all its pins (and keeps them in view). */
  start?: { center: LatLng; zoom: number };
  /** Moves the map to this spot whenever it changes, e.g. the pin someone picked */
  focus?: LatLng | null;
  expandable?: boolean;
  /** Called with the part of the map on screen once it loads and after every pan or zoom */
  onView?: (view: MapView) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<MapEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const markers = useRef(new Map<string, MarkerEntry>());
  const shownRoute = useRef<{ to: string; route: Route } | null>(null);
  const [slots, setSlots] = useState<Record<string, HTMLElement>>({});
  const framedIds = useRef("");
  const framedDestination = useRef("");
  const [expanded, setExpanded] = useState(false);
  const latest = useRef({ pins, onSelect, onRoute, onView, autoFrame: !start });
  useEffect(() => {
    latest.current = { pins, onSelect, onRoute, onView, autoFrame: !start };
  });

  // Draw the map once
  useEffect(() => {
    let cancelled = false;
    let made: MapEngine | null = null;
    const first = start?.center ?? latest.current.pins[0]?.at ?? DEFAULT_CENTER;
    const host = mapHost(container.current!);
    createMap({ container: host, center: first, zoom: start?.zoom ?? 15, interactive })
      .then((result) => {
        made = result;
        if (cancelled) return result.map.remove();
        setEngine(result);
      })
      .catch(() => !cancelled && setFailed(true));
    const ownMarkers = markers.current;
    return () => {
      cancelled = true;
      made?.map.remove();
      host.remove();
      for (const entry of ownMarkers.values()) if (entry.frame) cancelAnimationFrame(entry.frame);
      ownMarkers.clear();
      shownRoute.current = null;
      // A hidden page (kept by <Activity>) keeps its state, so forget the removed map;
      // otherwise coming back would put pins on it before the new one is ready
      setEngine(null);
      setSlots({});
      framedIds.current = "";
      framedDestination.current = "";
    };
    // start only matters for the first view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Keep the pins in sync: add new ones, move existing ones, remove old ones
  const pinsKey = pins.map((p) => `${p.id}:${p.at.lat.toFixed(6)},${p.at.lng.toFixed(6)}`).join("|");
  useEffect(() => {
    if (!engine) return;
    const current = markers.current;
    const wanted = new Set(pins.map((p) => p.id));
    for (const [id, { marker }] of current) {
      if (!wanted.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }
    for (const pin of pins) {
      const existing = current.get(pin.id);
      if (existing) {
        glide(existing, pin.at);
        continue;
      }
      const element = document.createElement("div");
      element.addEventListener("click", () => latest.current.onSelect?.(pin.id));
      const marker = engine.marker(element).setLngLat([pin.at.lng, pin.at.lat]).addTo(engine.map);
      current.set(pin.id, { marker, element, movedAt: performance.now() });
    }
    setSlots(Object.fromEntries([...current].map(([id, { element }]) => [id, element])));

    // Frame all pins when the set of pins changes, or when one moves out of view (the rider)
    const ids = pins.map((p) => p.id).join("|");
    const bounds = engine.map.getBounds();
    const outside = pins.some((p) => !bounds.contains([p.at.lng, p.at.lat]));
    if (latest.current.autoFrame && (ids !== framedIds.current || outside)) {
      framedIds.current = ids;
      frame(engine, pins.map((p) => p.at));
    }
    // pinsKey stands in for pins (a new array on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, pinsKey]);

  // Report the visible area, so a page can load only the pins that fit on screen
  useEffect(() => {
    if (!engine) return;
    const report = () => {
      const bounds = engine.map.getBounds();
      if (!bounds) return;
      const box = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      latest.current.onView?.({ bbox: box.map((n) => n.toFixed(5)).join(","), zoom: engine.map.getZoom() });
    };
    report();
    engine.map.on("moveend", report);
    return () => {
      engine.map.off("moveend", report);
    };
  }, [engine]);

  // The route line
  const routeKey = route ? [route.from.lat, route.from.lng, route.to.lat, route.to.lng].map((n) => n.toFixed(4)).join(",") : "";
  useEffect(() => {
    if (!engine) return;
    const { map } = engine;
    if (!route) {
      if (map.getLayer(ROUTE_SOURCE)) map.removeLayer(ROUTE_SOURCE);
      if (map.getLayer(`${ROUTE_SOURCE}-casing`)) map.removeLayer(`${ROUTE_SOURCE}-casing`);
      if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
      return;
    }
    let cancelled = false;
    const destination = `${route.to.lat},${route.to.lng}`;
    // Moving along the road already shown: just cut off the part behind, no new request
    const known = shownRoute.current?.to === destination ? trimRoute(shownRoute.current.route, route.from) : null;
    const ready = known ? Promise.resolve({ full: shownRoute.current!.route, ahead: known }) : getRoute(route.from, route.to).then((full) => ({ full, ahead: trimRoute(full, route.from) ?? full }));
    void ready.then(({ full, ahead: result }) => {
      if (cancelled) return;
      shownRoute.current = { to: destination, route: full };
      const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: result.line } };
      const source = map.getSource(ROUTE_SOURCE) as { setData?: (d: typeof data) => void } | undefined;
      if (source?.setData) source.setData(data);
      else {
        map.addSource(ROUTE_SOURCE, { type: "geojson", data });
        map.addLayer({
          id: `${ROUTE_SOURCE}-casing`,
          type: "line",
          source: ROUTE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 8 },
        });
        map.addLayer({
          id: ROUTE_SOURCE,
          type: "line",
          source: ROUTE_SOURCE,
          layout: { "line-cap": "round", "line-join": "round" },
          // A straight line is only a guide, so it's dashed; a road route is solid
          paint: { "line-color": "#d24600", "line-width": 4, ...(result.roads ? {} : { "line-dasharray": [1.5, 1.5] }) },
        });
      }
      // Once per destination, zoom out to show the whole way (later rider moves keep the view)
      if (latest.current.autoFrame && framedDestination.current !== destination) {
        framedDestination.current = destination;
        frame(engine, [...latest.current.pins.map((p) => p.at), ...result.line.map(([lng, lat]) => ({ lat, lng }))]);
      }
      latest.current.onRoute?.(result);
    });
    return () => {
      cancelled = true;
    };
    // routeKey stands in for route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, routeKey]);

  // Move to the focused spot
  const focusKey = focus ? `${focus.lat},${focus.lng}` : "";
  useEffect(() => {
    if (engine && focus) engine.map.easeTo({ center: [focus.lng, focus.lat], zoom: Math.max(engine.map.getZoom(), 16), duration: 600 });
    // focusKey stands in for focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, focusKey]);

  // Full screen: the map has a new size, so redraw it and frame its pins again. Esc closes it.
  useEffect(() => {
    if (!engine) return;
    engine.map.resize();
    if (latest.current.autoFrame && latest.current.pins.length) frame(engine, latest.current.pins.map((p) => p.at));
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setExpanded(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [engine, expanded]);

  return (
    <div className={expanded ? "fixed inset-0 z-[60] bg-canvas" : `relative overflow-hidden bg-canvas ${className}`}>
      <div ref={container} className="absolute inset-0" role="img" aria-label={label} />
      {expandable && engine && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-label={expanded ? "Close the full-screen map" : "Open the map full screen"}
          className={`absolute z-10 flex items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 ${
            expanded ? "top-[calc(0.75rem+env(safe-area-inset-top))] left-3 size-11" : "top-2 right-2 size-9"
          }`}
        >
          {expanded ? <X className="size-5" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
        </button>
      )}
      {!engine && !failed && <div aria-hidden className="absolute inset-0 animate-pulse bg-gray-200/70" />}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
          <MapPinOff className="size-6" aria-hidden />
          The map couldn&apos;t load. Check your internet connection.
        </div>
      )}
      {pins.map((pin) => slots[pin.id] && createPortalPin(pin, slots[pin.id]))}
    </div>
  );
}

type MarkerEntry = {
  marker: ReturnType<MapEngine["marker"]>;
  element: HTMLElement;
  /** When the pin last got a new position, to glide over about the same time to the next */
  movedAt: number;
  frame?: number;
};

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Moves a pin to its new spot smoothly instead of jumping. A moving rider sends a position
 * every few seconds, so the glide lasts about as long as the gap between positions: the pin
 * keeps moving at an even pace and reaches each spot as the next one arrives. Long jumps
 * (a first fix, a reload) and reduced motion just move it.
 */
function glide(entry: MarkerEntry, to: LatLng) {
  const now = performance.now();
  const gap = now - entry.movedAt;
  entry.movedAt = now;
  if (entry.frame) cancelAnimationFrame(entry.frame);
  const start = entry.marker.getLngLat();
  const from = { lat: start.lat, lng: start.lng };
  if (reducedMotion() || distanceKm(from, to) > 1) {
    entry.marker.setLngLat([to.lng, to.lat]);
    return;
  }
  const duration = Math.min(Math.max(gap, 300), 5000);
  const step = (time: number) => {
    const t = Math.min((time - now) / duration, 1);
    entry.marker.setLngLat([from.lng + (to.lng - from.lng) * t, from.lat + (to.lat - from.lat) * t]);
    entry.frame = t < 1 ? requestAnimationFrame(step) : undefined;
  };
  entry.frame = requestAnimationFrame(step);
}

function createPortalPin(pin: MapPin, element: HTMLElement) {
  return createPortal(<PinBody pin={pin} />, element, pin.id);
}

/** Fits the map around the points, or centers on a single one. */
function frame({ map }: MapEngine, points: LatLng[]) {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.easeTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(map.getZoom(), 15) });
    return;
  }
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: 56, maxZoom: 16, duration: 600 },
  );
}

/** What a pin looks like. */
function PinBody({ pin }: { pin: MapPin }) {
  const body =
    pin.kind === "rider" ? (
      <span className="relative flex size-11 items-center justify-center">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
        <Image src="/icons/icon-192.png" alt="" width={44} height={44} unoptimized className="relative size-11 rounded-full border-[3px] border-brand-600 bg-white shadow-lg" />
      </span>
    ) : pin.kind === "me" ? (
      <span className="block size-[18px] rounded-full border-[3px] border-white bg-sky-500 shadow-[0_0_0_7px_rgba(14,165,233,0.25)]" />
    ) : (
      <span
        className={`flex size-9 items-center justify-center rounded-full border-[3px] border-white text-white shadow-lg ${
          pin.kind === "store" ? "bg-brand-600" : "bg-ink"
        }`}
      >
        {pin.kind === "store" ? <Store className="size-4" aria-hidden /> : <House className="size-4" aria-hidden />}
      </span>
    );
  return (
    // The label hangs below without changing the pin's size, so the pin stays centered on its spot
    <span
      className={`relative flex cursor-pointer transition ${pin.muted ? "opacity-55 grayscale" : ""} ${
        pin.selected ? "z-10 scale-125 [&>span:first-child]:ring-4 [&>span:first-child]:ring-brand-500/40" : ""
      }`}
      title={pin.label}
    >
      {body}
      {pin.label && (
        <span className="absolute top-full left-1/2 mt-1 max-w-32 -translate-x-1/2 truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-ink shadow">
          {pin.label}
        </span>
      )}
    </span>
  );
}
