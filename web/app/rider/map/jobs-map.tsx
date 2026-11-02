"use client";

import { ArrowRight, Bike, LocateFixed, MapPin, Power, Store, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { FeastoMap, type MapPin as Pin, type MapView } from "@/components/map/feasto-map";
import { FullMapFrame, MapButton } from "@/components/map/full-map";
import { useGeolocation } from "@/components/map/use-my-location";
import { formatPeso } from "@/lib/format";
import { DEFAULT_CENTER, distanceKm, formatDistance, pinOf, type LatLng } from "@/lib/geo";
import type { JobsPage, RiderDelivery } from "@/lib/types";
import { AcceptJobButton } from "../accept-job-button";
import { groupJobsByStore, groupLabel, groupStores } from "../job-groups";
import { useJobsChanged } from "../use-open-jobs";

/** The most jobs loaded for one view of the map */
const MAX_JOBS = 100;

/**
 * Open jobs and the current delivery on one map, starting over Naval. Only the jobs whose
 * store is in view are loaded, again after every pan or zoom and whenever jobs change.
 */
export function JobsMap({ active, online }: { active: RiderDelivery | null; online: boolean }) {
  const { position: me, error } = useGeolocation();
  const [view, setView] = useState<MapView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const changed = useJobsChanged();

  const query =
    view &&
    new URLSearchParams({
      bbox: view.bbox,
      limit: String(MAX_JOBS),
      sort: "nearest",
      // Over a busy town, the jobs nearest the rider are the ones worth drawing
      ...(me && { lat: me.lat.toFixed(3), lng: me.lng.toFixed(3) }),
    });
  const { data } = useApiData<JobsPage>(query && `/rider/jobs?${query}`, `${online}:${changed}`);
  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;

  const groups = groupJobsByStore(jobs);
  const selected = groups.find((group) => group.id === selectedId) ?? null;
  const activeStore = active ? pinOf(active.vendor.latitude, active.vendor.longitude) : null;
  const activeHome = active ? pinOf(active.checkout.deliveryLat, active.checkout.deliveryLng) : null;

  const pins: Pin[] = [
    ...groups.map((group) => ({ id: group.id, kind: "store" as const, at: group.at, label: groupLabel(group), selected: group.id === selectedId })),
    ...(activeStore ? [{ id: "active-store", kind: "store" as const, at: activeStore, label: "Pickup" }] : []),
    ...(activeHome ? [{ id: "active-home", kind: "home" as const, at: activeHome, label: "Drop-off" }] : []),
    ...(me ? [{ id: "me", kind: "me" as const, at: me }] : []),
  ];

  return (
    <FullMapFrame>
      <FeastoMap
        pins={pins}
        start={{ center: DEFAULT_CENTER, zoom: 15 }}
        focus={focus}
        expandable={false}
        className="h-full"
        label={`Map of ${total} open delivery jobs in view`}
        onView={setView}
        onSelect={(id) => {
          const group = groups.find((g) => g.id === id);
          if (!group) return;
          setSelectedId(id);
          setFocus(group.at);
        }}
      />

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <p className="pointer-events-auto rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-ink shadow-md ring-1 ring-black/5">
          {online ? `${total} open ${total === 1 ? "job" : "jobs"} here` : "You're offline"}
        </p>
        <div className="pointer-events-auto">
          <MapButton
            label="Show where I am"
            Icon={LocateFixed}
            active={Boolean(me)}
            onClick={() => (me ? setFocus({ ...me }) : undefined)}
          />
        </div>
      </div>
      {error === "blocked" && (
        <p className="absolute inset-x-3 top-16 rounded-xl bg-white px-3 py-2 text-sm text-red-600 shadow-md">
          Location is blocked. Allow it in your browser settings to see yourself on the map.
        </p>
      )}

      <div className="absolute inset-x-3 bottom-3 space-y-2">
        {!online && (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
            <Power className="size-5 shrink-0 text-muted" aria-hidden />
            <p className="text-sm text-ink">Turn on the Online switch above to see delivery jobs.</p>
          </div>
        )}
        {online && !selected && total > jobs.length && (
          <p className="rounded-2xl bg-white px-4 py-3 text-center text-sm text-muted shadow-xl">
            Showing the {jobs.length} nearest. Zoom in to see the rest.
          </p>
        )}
        {active && !selected && (
          <Link href="/rider/active" className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-xl ring-2 ring-brand-500">
            <Bike className="size-5 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Current delivery: {active.vendor.name}</span>
              <span className="block truncate text-xs text-muted">To {active.checkout.deliveryAddress}</span>
            </span>
            <ArrowRight className="size-4 text-brand-700" aria-hidden />
          </Link>
        )}
        {selected && (
          <div className="max-h-[60dvh] overflow-y-auto rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-2">
              <p className="flex gap-2 text-sm">
                <Store className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{groupStores(selected).join(", ")}</span>
                  {me && <span className="text-sky-700"> · {formatDistance(distanceKm(me, selected.at))} away</span>}
                </span>
              </p>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close" className="-mt-1 rounded-lg p-1 text-muted hover:bg-canvas hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <ul className="mt-2 divide-y divide-line">
              {selected.jobs.map((job) => (
                <li key={job.id} className="py-2.5 first:pt-1 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex min-w-0 gap-2 text-sm text-muted">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span className="min-w-0">
                        {groupStores(selected).length > 1 && <span className="block font-semibold text-ink">{job.vendor.name}</span>}
                        <span className="block truncate">{job.checkout.deliveryAddress}</span>
                      </span>
                    </p>
                    <p className="shrink-0 font-bold text-ink">{formatPeso(job.deliveryFee)}</p>
                  </div>
                  <div className="mt-2">
                    {active ? <p className="text-center text-sm text-muted">Finish your current delivery first.</p> : <AcceptJobButton orderId={job.id} />}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FullMapFrame>
  );
}
