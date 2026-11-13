"use client";

import { ArrowRight, Bike, LocateFixed, MapPin, Power, Store, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { FeastoMap, type MapPin as Pin, type MapView } from "@/components/map/feasto-map";
import { FullMapFrame, MapButton } from "@/components/map/full-map";
import { setDemoPosition, useGeolocation } from "@/components/map/use-my-location";
import { formatPeso } from "@/lib/format";
import { DEFAULT_CENTER, distanceKm, formatDistance, pinOf, type LatLng } from "@/lib/geo";
import { riderEarns } from "@/lib/order-status";
import type { JobsPage, RiderDelivery } from "@/lib/types";
import { AcceptJobButton } from "../accept-job-button";
import { groupJobsByStore, groupLabel, groupStores } from "../job-groups";
import { useJobsChanged } from "../use-open-jobs";
import { OfflineHint } from "../offline-hint";

/** The most jobs loaded for one view of the map */
const MAX_JOBS = 100;

/**
 * Open jobs and the current delivery on one map, starting over Naval. Only the jobs whose
 * store is in view are loaded, again after every pan or zoom and whenever jobs change.
 */
export function JobsMap({ active, online }: { active: RiderDelivery | null; online: boolean }) {
  const { position: me, error, simulated } = useGeolocation();
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
    <FullMapFrame role="RIDER">
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

      {/* Laptops up: every job in view listed beside the map; choosing one shows its pin */}
      <aside aria-label="Jobs in view" className="absolute top-3 bottom-3 left-3 z-[1] hidden w-[320px] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5 lg:flex">
        <div className="shrink-0 border-b border-line px-4 py-3">
          <p className="font-semibold text-ink">{online ? `${total} open ${total === 1 ? "job" : "jobs"} in view` : "You're offline"}</p>
          <p className="text-xs text-muted">{online ? "Move the map to see jobs elsewhere." : "Go online to see and take jobs."}</p>
        </div>
        {online && groups.length === 0 ? (
          <p className="p-4 text-sm text-muted">No open jobs in this part of the map.</p>
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {groups.flatMap((group) =>
              group.jobs.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(group.id);
                      setFocus(group.at);
                    }}
                    aria-pressed={group.id === selectedId}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                      group.id === selectedId ? "bg-brand-50/70" : ""
                    }`}
                  >
                    <Store className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{job.vendor.name}</span>
                      <span className="block truncate text-xs text-muted">To {job.checkout.deliveryAddress}</span>
                      {me && <span className="block text-xs text-sky-700">{formatDistance(distanceKm(me, group.at))} from you</span>}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-ink tabular-nums">{formatPeso(riderEarns(job))}</span>
                  </button>
                </li>
              )),
            )}
          </ul>
        )}
      </aside>

      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 lg:left-[344px]">
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <p className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-ink shadow-md ring-1 ring-black/5">
            {online ? `${total} open ${total === 1 ? "job" : "jobs"} here` : "You're offline"}
          </p>
          {/* For showing Feasto without riding around: the rider counts as being at the map's center */}
          {online && (
            <button
              type="button"
              onClick={() => {
                if (simulated) return setDemoPosition(null);
                const [west, south, east, north] = (view?.bbox ?? "").split(",").map(Number);
                if (view) setDemoPosition({ lat: (south + north) / 2, lng: (west + east) / 2 });
              }}
              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-md ring-1 ring-black/5 hover:bg-canvas"
            >
              {simulated ? "Demo: use my real GPS" : "Demo: place me at the map's center"}
            </button>
          )}
        </div>
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
        <p className="absolute inset-x-3 top-24 rounded-xl md:right-auto md:max-w-sm lg:left-[344px] bg-white px-3 py-2 text-sm text-red-600 shadow-md">
          Location is blocked. Allow it in your browser settings to see yourself on the map.
        </p>
      )}

      <div className="absolute inset-x-3 bottom-3 space-y-2 md:left-auto md:w-[380px]">
        {!online && (
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5">
            <Power className="size-5 shrink-0 text-muted" aria-hidden />
            <p className="text-sm text-ink">
              <OfflineHint licenseExpired={data?.licenseExpired} />
            </p>
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
                    <p className="shrink-0 font-bold text-ink">{formatPeso(riderEarns(job))}</p>
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
