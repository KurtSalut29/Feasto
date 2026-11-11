"use client";

import { House, LocateFixed, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RatingBadge } from "@/components/app/rating";
import { OpenBadge, StoreCover } from "@/components/app/store-card";
import { useApiData } from "@/components/app/use-api-data";
import { FeastoMap, type MapPin, type MapView } from "@/components/map/feasto-map";
import { FullMapFrame, MapButton, useLocateMe } from "@/components/map/full-map";
import { ButtonLink } from "@/components/ui/button";
import { DEFAULT_CENTER, distanceKm, formatDistance, pinOf, type LatLng } from "@/lib/geo";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { StorePage, StoreSummary } from "@/lib/types";

/** The most store pins drawn at once; zoomed out over a busy town, the rest wait for a zoom in */
const MAX_PINS = 100;

/**
 * The stores on one map, starting over Naval. Only the stores in view are loaded (up to
 * MAX_PINS, open ones first), again after every pan or zoom, so the map stays quick in a town with
 * thousands of stores. Tap a pin to see the store.
 */
export function StoresMap({ home, homeLabel }: { home: LatLng | null; homeLabel: string | null }) {
  const [openOnly, setOpenOnly] = useState(false);
  const [view, setView] = useState<MapView | null>(null);
  const [selected, setSelected] = useState<{ store: StoreSummary; at: LatLng } | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const { me, locate, locating, error } = useLocateMe();

  const { data } = useApiData<StorePage>(view && `/stores?${new URLSearchParams({ bbox: view.bbox, limit: String(MAX_PINS) })}`);

  const pinned = useMemo(
    () =>
      (data?.stores ?? []).flatMap((store) => {
        const at = pinOf(store.latitude, store.longitude);
        return at && (!openOnly || store.isOpen) ? [{ store, at }] : [];
      }),
    [data, openOnly],
  );
  const from = me ?? home;

  const pins: MapPin[] = [
    ...pinned
      .filter(({ store }) => store.id !== selected?.store.id)
      .map(({ store, at }) => ({ id: store.id, kind: "store" as const, at, label: store.name, muted: !store.isOpen })),
    // The tapped store stays on the map even after panning away from it
    ...(selected ? [{ id: selected.store.id, kind: "store" as const, at: selected.at, label: selected.store.name, muted: !selected.store.isOpen, selected: true }] : []),
    ...(home ? [{ id: "home", kind: "home" as const, at: home, label: homeLabel ?? "Home" }] : []),
    ...(me ? [{ id: "me", kind: "me" as const, at: me }] : []),
  ];

  const chip = (on: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-semibold shadow-md ring-1 ring-black/5 transition ${on ? "bg-ink text-white" : "bg-white text-ink hover:bg-canvas"}`;

  return (
    <FullMapFrame>
      <FeastoMap
        pins={pins}
        start={{ center: DEFAULT_CENTER, zoom: 15 }}
        focus={focus}
        expandable={false}
        className="h-full"
        label={`Map of ${pinned.length} stores in view`}
        onView={setView}
        onSelect={(id) => {
          const tapped = pinned.find(({ store }) => store.id === id);
          if (!tapped) return;
          setSelected(tapped);
          setFocus(tapped.at);
        }}
      />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex gap-2" role="group" aria-label="Which stores to show">
          <button type="button" aria-pressed={!openOnly} onClick={() => setOpenOnly(false)} className={chip(!openOnly)}>
            All stores · {data?.total ?? 0}
          </button>
          <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly(true)} className={chip(openOnly)}>
            Open now · {data?.openCount ?? 0}
          </button>
        </div>
        <div className="pointer-events-auto flex flex-col gap-2">
          <MapButton
            label="Show where I am"
            Icon={LocateFixed}
            busy={locating}
            active={Boolean(me)}
            onClick={() => {
              if (me) setFocus({ ...me });
              locate();
            }}
          />
          {home && <MapButton label={`Show ${homeLabel ?? "my address"}`} Icon={House} onClick={() => setFocus({ ...home })} />}
        </div>
      </div>
      {error && <p className="absolute inset-x-3 top-16 rounded-xl md:right-auto md:max-w-sm bg-white px-3 py-2 text-sm text-red-600 shadow-md">{error}</p>}

      {selected && (
        <div className="absolute inset-x-3 bottom-3 md:left-auto md:w-[400px] rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
          <div className="flex gap-3">
            <StoreCover imageUrl={selected.store.imageUrl} className="size-16 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate font-semibold text-ink">{selected.store.name}</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="-mt-1 -mr-1 rounded-lg p-1 text-muted hover:bg-canvas hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <RatingBadge rating={selected.store.rating} count={selected.store.ratingCount} />
                <span aria-hidden>·</span>
                {STORE_TYPE_LABEL[selected.store.storeType]}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-sm">
                <OpenBadge isOpen={selected.store.isOpen} opensAt={selected.store.opensAt} />
                {from && <span className="font-medium text-ink">{formatDistance(distanceKm(from, selected.at))} {me ? "from you" : `from ${homeLabel ?? "home"}`}</span>}
              </div>
            </div>
          </div>
          <ButtonLink href={`/resident/stores/${selected.store.id}`} className="mt-3 w-full">
            View menu
          </ButtonLink>
        </div>
      )}
      {!selected && data && (openOnly ? data.openCount : data.total) === 0 && (
        <p className="absolute inset-x-3 bottom-3 md:left-auto md:w-[400px] rounded-2xl bg-white p-4 text-center text-sm text-muted shadow-xl">
          No {openOnly ? "open " : ""}stores in this part of the map. Zoom out, or{" "}
          <Link href="/resident/stores" className="font-semibold text-brand-700">
            see the store list
          </Link>
          .
        </p>
      )}
      {!selected && data && data.total > data.stores.length && (
        <p className="absolute inset-x-3 bottom-3 md:left-auto md:w-[400px] rounded-2xl bg-white px-4 py-3 text-center text-sm text-muted shadow-xl">
          Showing {data.stores.length} of {data.total} stores here. Zoom in to see the rest.
        </p>
      )}
    </FullMapFrame>
  );
}
