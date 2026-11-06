"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { LoaderCircle, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_CENTER, type LatLng } from "@/lib/geo";
import { createMap, mapHost, MAPBOX_TOKEN, searchPlaces, type MapEngine, type Place } from "./map-engine";

/**
 * Choose a spot by moving the map under a fixed pin, like ride-hailing apps.
 * "Use my location" jumps to the phone's GPS; with Mapbox there's also an address search.
 * Calls onChange only after the person moves the map or picks a place, so an untouched
 * map never saves a made-up spot.
 */
export function LocationPicker({
  value,
  onChange,
  near,
  label = "Pin on the map",
  hint = "Move the map so the pin sits on the exact spot.",
  error,
  required = false,
}: {
  value: LatLng | null;
  onChange: (at: LatLng) => void;
  /** Where to start when there's no pin yet */
  near?: LatLng | null;
  label?: string;
  hint?: string;
  error?: string;
  /** The form can't be sent without a pin, e.g. a new store's location */
  required?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<MapEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<string>();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;
    const start = value ?? near ?? DEFAULT_CENTER;
    const host = mapHost(container.current!);
    createMap({ container: host, center: start, zoom: value ? 17 : 15 })
      .then((made) => {
        if (cancelled) return made.map.remove();
        engine.current = made;
        made.map.on("moveend", (event: { originalEvent?: Event }) => {
          // Only moves made by the person (dragging, zooming), not our own flyTo
          if (!event.originalEvent) return;
          const center = made.map.getCenter();
          onChangeRef.current({ lat: center.lat, lng: center.lng });
        });
        setReady(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      engine.current?.map.remove();
      engine.current = null;
      host.remove();
    };
    // The map starts once at the first value; later changes come from the map itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(at: LatLng) {
    engine.current?.map.flyTo({ center: [at.lng, at.lat], zoom: 17, duration: 800 });
    onChange(at);
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setMessage("This device can't share its location.");
    setLocating(true);
    setMessage(undefined);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        goTo({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setMessage("Location is blocked. Allow it in your browser settings, or move the map yourself.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-ink">{label}</p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={!ready || locating}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-50"
        >
          {locating ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
          Use my location
        </button>
      </div>
      {MAPBOX_TOKEN && ready && <PlaceSearch near={value ?? near ?? DEFAULT_CENTER} onPick={(place) => goTo(place.at)} />}
      <div className={`relative h-56 overflow-hidden rounded-xl border bg-canvas ${error ? "border-red-400" : "border-line"}`}>
        <div ref={container} className="absolute inset-0" role="application" aria-label={`${label}: drag the map to move the pin`} />
        {!ready && !failed && <div aria-hidden className="absolute inset-0 animate-pulse bg-gray-200/70" />}
        {failed ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted">
            {required ? "The map couldn't load. Check your internet connection and try again." : "The map couldn't load. You can still save without a pin."}
          </p>
        ) : (
          // The pin stays in the middle; its tip marks the spot
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
            <MapPin className={`size-10 drop-shadow-md ${value ? "fill-brand-600 text-white" : "fill-gray-400 text-white"}`} strokeWidth={1.5} />
          </span>
        )}
      </div>
      <p className={`mt-1 text-[13px] ${error ? "text-red-600" : "text-muted"}`}>
        {error ?? message ?? (value ? "Pin set. Move the map to adjust it." : hint)}
      </p>
    </div>
  );
}

/** Address search box with suggestions (Mapbox only). */
function PlaceSearch({ near, onPick }: { near: LatLng; onPick: (place: Place) => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) return;
    // Wait for a pause in typing before asking Mapbox
    const timer = setTimeout(async () => {
      setPlaces(await searchPlaces(query, near));
      setOpen(true);
    }, 350);
    return () => clearTimeout(timer);
    // near only biases results; searching again when it moves would be noise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="relative mb-2">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => places.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search a street or place"
        aria-label="Search a street or place"
        className="h-11 w-full rounded-xl border border-line bg-white pr-4 pl-10 text-[15px] text-ink outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 sm:h-10"
      />
      {open && query.trim().length >= 3 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          {places.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No places found. Try a nearby street.</li>
          ) : (
            places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(place);
                    setOpen(false);
                    setQuery(place.name);
                  }}
                  className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-canvas"
                >
                  <span className="text-sm font-medium text-ink">{place.name}</span>
                  <span className="truncate text-xs text-muted">{place.detail}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
