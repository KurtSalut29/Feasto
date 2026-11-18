"use client";

import { Bike, Check, MapPin, Search, Star, Users } from "lucide-react";
import { useState } from "react";
import { useApiData } from "./use-api-data";
import { formatDistance, type LatLng } from "@/lib/geo";

export type ChoosableRider = {
  id: string;
  name: string;
  vehicle: string | null;
  rating: number | null;
  ratingCount: number;
  deliveries: number;
  distanceKm: number | null;
  /** Has delivered to this resident before */
  servedYou: boolean;
};

/**
 * Who brings it: the nearest free rider (the usual), or a rider the resident picks. Only free
 * riders who are online right now are listed, nearest to `near` (the store or the shop) first,
 * with the ones who delivered to this resident before on top. The chosen rider gets the job
 * alone for a moment; if they can't take it, it goes to the nearest riders.
 */
export function RiderPicker({ near, value, onChange }: { near: LatLng | null; value: ChoosableRider | null; onChange: (rider: ChoosableRider | null) => void }) {
  const [choosing, setChoosing] = useState(value !== null);
  const [query, setQuery] = useState("");
  const { data, loading } = useApiData<{ riders: ChoosableRider[]; waitSeconds: number }>(choosing && near ? `/riders/available?lat=${near.lat}&lng=${near.lng}` : null);
  const riders = (data?.riders ?? []).filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));
  // The chosen rider went offline or took another job since: let the resident see that
  const gone = value && data && !data.riders.some((r) => r.id === value.id);

  const option = (on: boolean) =>
    `flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500 ${
      on ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line bg-white hover:bg-canvas"
    }`;

  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Who delivers it</legend>
      <label className={option(!choosing)}>
        <input
          type="radio"
          name="rider-choice"
          className="sr-only"
          checked={!choosing}
          onChange={() => {
            setChoosing(false);
            onChange(null);
          }}
        />
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Users className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Nearest free rider</span>
          <span className="block text-sm text-muted">The quickest way: Feasto asks the riders closest to the store.</span>
        </span>
        {!choosing && <Check className="size-5 shrink-0 text-brand-600" aria-hidden />}
      </label>
      <label className={option(choosing)}>
        <input type="radio" name="rider-choice" className="sr-only" checked={choosing} onChange={() => setChoosing(true)} />
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Bike className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Choose a rider</span>
          <span className="block text-sm text-muted">
            Pick someone you trust. They get it first for {data?.waitSeconds ?? 90} seconds; if they can&apos;t, the nearest rider takes it.
          </span>
        </span>
        {choosing && <Check className="size-5 shrink-0 text-brand-600" aria-hidden />}
      </label>

      {choosing && (
        <div className="rounded-2xl border border-line bg-canvas/50 p-3">
          {!near ? (
            <p className="text-sm text-muted">Set where to buy first, so Feasto can find the riders near it.</p>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">Search riders by name</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search riders by name"
                  className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm text-ink placeholder:text-gray-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                />
              </label>
              {gone && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{value.name} just went offline or took another job. Choose someone else.</p>}
              <div role="radiogroup" aria-label="Riders online now" className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
                {loading && !data && <p className="px-1 py-3 text-sm text-muted">Finding riders online…</p>}
                {data && riders.length === 0 && (
                  <p className="px-1 py-3 text-sm text-muted">{query ? "No rider online by that name." : "No free rider is online right now. Choose Nearest free rider instead."}</p>
                )}
                {riders.map((rider) => {
                  const on = value?.id === rider.id;
                  return (
                    <label key={rider.id} className={option(on)}>
                      <input type="radio" name="rider" className="sr-only" checked={on} onChange={() => onChange(rider)} />
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white" aria-hidden>
                        {rider.name.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-semibold text-ink">{rider.name}</span>
                          {rider.rating !== null && (
                            <span className="inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-ink">
                              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                              {rider.rating.toFixed(1)}
                              <span className="sr-only"> stars</span>
                            </span>
                          )}
                          {rider.servedYou && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Delivered to you before</span>}
                        </span>
                        <span className="block truncate text-sm text-muted">
                          {[rider.vehicle, `${rider.deliveries} ${rider.deliveries === 1 ? "delivery" : "deliveries"}`].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {rider.distanceKm !== null && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted tabular-nums">
                          <MapPin className="size-3.5" aria-hidden />
                          {formatDistance(rider.distanceKm)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
