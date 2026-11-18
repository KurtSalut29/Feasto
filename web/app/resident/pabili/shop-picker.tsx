"use client";

import { ArrowRight, Check, MapPin, MapPinned, Search, Store, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { formatDistance } from "@/lib/geo";
import { PLACE_KIND, type PabiliPlace } from "./errand";

type FeastoStore = { id: string; name: string; address: string };
type Places = { places: PabiliPlace[]; total: number; stores: FeastoStore[]; maxKm: number };

const row =
  "flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * Where to buy: a shop from the admin's list (its pin was set by someone who knows the place, so
 * the fee and the rider's directions are right), or, as a last resort, a shop the resident names
 * and pins. A Feasto store that matches the search links to its menu instead: ordering there
 * reaches the store, and the resident can still choose their rider at checkout.
 */
export function ShopPicker({
  addressId,
  value,
  custom,
  onPick,
  onCustom,
  onReset,
  error,
}: {
  addressId: string;
  value: PabiliPlace | null;
  custom: boolean;
  onPick: (place: PabiliPlace) => void;
  onCustom: () => void;
  onReset: () => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  const { data, loading } = useApiData<Places>(value || custom ? null : `/errands/places?q=${encodeURIComponent(search)}&addressId=${addressId}`);

  if (value) {
    return (
      <div className={`${row} border-brand-500 bg-brand-50/60 ring-1 ring-brand-500`}>
        <Check className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{value.name}</span>
          <span className="block text-sm text-muted">
            {PLACE_KIND[value.kind]} · {value.address}
          </span>
          <span className="mt-1 block text-[0.8125rem] text-emerald-700">Pinned by Feasto, so the fee and the rider&apos;s directions are exact.</span>
        </span>
        <button type="button" onClick={onReset} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-500">
          Change
        </button>
      </div>
    );
  }

  if (custom) {
    return (
      <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <p>Not on the list: name the shop and pin it. The rider&apos;s phone checks the spot when they buy, and the fee follows where the shop really is.</p>
        <button type="button" onClick={onReset} className="-ml-3 mt-1 rounded-full px-3 py-1.5 font-semibold text-brand-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-500">
          Back to the list
        </button>
      </div>
    );
  }

  const places = data?.places ?? [];
  const stores = data?.stores ?? [];
  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor="shop-search" className="mb-1 block text-sm font-medium text-ink">
          Find the shop
        </label>
        <Search className="pointer-events-none absolute bottom-3.5 left-3 size-4 text-gray-500" aria-hidden />
        <input
          id="shop-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Market, drugstore, hardware…"
          aria-describedby={error ? "shop-error" : undefined}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-[0.9375rem] text-ink outline-none transition placeholder:text-gray-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
      </div>
      {error && (
        <p id="shop-error" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {stores.map((s) => (
        <div key={s.id} className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <UtensilsCrossed className="size-4 shrink-0 text-brand-600" aria-hidden />
            {s.name} is on Feasto
          </p>
          <p className="mt-1 text-sm text-muted">Order from its menu instead: the store gets your order right away, and you can still choose your rider at checkout.</p>
          <Link
            href={`/resident/stores/${s.id}`}
            className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            See the menu
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      ))}

      <div aria-live="polite" aria-busy={loading}>
        {places.length > 0 ? (
          <>
            <p className="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">{search.length >= 2 ? "Shops on the list" : "Nearest to your address"}</p>
            <ul className="space-y-2">
              {places.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPick(p)} className={`${row} border-line bg-white hover:bg-canvas`}>
                    <Store className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{p.name}</span>
                      <span className="block text-sm text-muted">
                        {PLACE_KIND[p.kind]} · {p.address}
                      </span>
                    </span>
                    {p.distanceKm !== null && <span className="shrink-0 text-sm text-muted tabular-nums">{formatDistance(p.distanceKm)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          data && (
            <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {search.length >= 2 ? `No shop on the list matches “${search}”.` : "There are no shops on the list yet."}
            </p>
          )
        )}
      </div>

      <button type="button" onClick={onCustom} className={`${row} border-dashed border-gray-300 bg-white hover:border-brand-500 hover:bg-canvas`}>
        <MapPinned className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">My shop isn&apos;t on the list</span>
          <span className="block text-sm text-muted">Name it and pin it on the map, within {data?.maxKm ?? 5} km of your address.</span>
        </span>
      </button>
    </div>
  );
}
