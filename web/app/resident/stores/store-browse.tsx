import { CalendarDays, Heart, Search, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { STORE_TYPE_LABEL, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StoreType } from "@/lib/types";
import { SortMenu } from "./category-tabs";

/** What the store list is showing; every part lives in the address so Back and sharing keep it. */
export type BrowseFilters = {
  q: string;
  type?: StoreType;
  bookable: boolean;
  saved: boolean;
  open: boolean;
  sort?: "nearest" | "rating" | "name";
};

export const NO_FILTERS: BrowseFilters = { q: "", bookable: false, saved: false, open: false };

export function readFilters(params: Record<string, string | string[] | undefined>): BrowseFilters {
  const sort = params.sort;
  return {
    q: typeof params.q === "string" ? params.q.trim() : "",
    type: STORE_TYPE_OPTIONS.find((o) => o.value === params.type)?.value as StoreType | undefined,
    bookable: params.reservations === "1",
    saved: params.favorites === "1",
    open: params.open === "1",
    sort: sort === "nearest" || sort === "rating" || sort === "name" ? sort : undefined,
  };
}

/** The query string for these filters, for both the API and the page address. */
export function filterQuery(f: BrowseFilters) {
  return new URLSearchParams({
    ...(f.q && { q: f.q }),
    ...(f.type && { type: f.type }),
    ...(f.bookable && { reservations: "1" }),
    ...(f.saved && { favorites: "1" }),
    ...(f.open && { open: "1" }),
    ...(f.sort && { sort: f.sort }),
  });
}

export function browseHref(f: BrowseFilters) {
  const query = filterQuery(f).toString();
  return query ? `/resident/stores?${query}` : "/resident/stores";
}

/** Search box. Searching always opens the store list, and stays inside the chosen category. */
export function StoreSearch({ filters, autoFocus }: { filters: BrowseFilters; autoFocus?: boolean }) {
  const words = filters.type ? `Search in ${STORE_TYPE_LABEL[filters.type]}` : "Search stores or dishes";
  return (
    <form action="/resident/stores" className="relative" role="search">
      {[...filterQuery({ ...filters, q: "" })].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        key={filters.q}
        type="search"
        name="q"
        defaultValue={filters.q}
        autoFocus={autoFocus}
        maxLength={60}
        placeholder={words}
        aria-label={words}
        className="h-12 w-full rounded-xl border border-line bg-canvas pr-12 pl-12 text-[15px] outline-none placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {filters.q && (
        <Link
          href={browseHref({ ...filters, q: "" })}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-5" aria-hidden />
        </Link>
      )}
    </form>
  );
}

const SORT_LABEL = { nearest: "Nearest", rating: "Top rated", name: "A–Z" } as const;

const filterChip = (on: boolean) =>
  `flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
    on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-gray-300"
  }`;

/**
 * What narrows the list and how it's ordered, in one sideways row. Each filter switches on and
 * off where it is, keeping the place on the page. `sort` is left out when there's nothing to order.
 */
export function StoreFilters({ filters, sort, canMeasure }: { filters: BrowseFilters; sort?: keyof typeof SORT_LABEL; canMeasure: boolean }) {
  const chip = (on: boolean, change: Partial<BrowseFilters>, children: ReactNode) => (
    <Link href={browseHref({ ...filters, ...change })} aria-pressed={on} replace scroll={false} className={filterChip(on)}>
      {children}
    </Link>
  );
  const sorts = (canMeasure ? ["nearest", "rating", "name"] : ["rating", "name"]) as (keyof typeof SORT_LABEL)[];
  return (
    <div role="group" aria-label="Filter stores" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]">
      {sort && <SortMenu value={sort} options={sorts.map((value) => ({ value, label: SORT_LABEL[value], href: browseHref({ ...filters, sort: value }) }))} />}
      {chip(
        filters.open,
        { open: !filters.open },
        <>
          <span className={`size-2 rounded-full ${filters.open ? "bg-emerald-300" : "bg-emerald-500"}`} aria-hidden />
          Open now
        </>,
      )}
      {chip(
        filters.bookable,
        { bookable: !filters.bookable },
        <>
          <CalendarDays className="size-4" aria-hidden />
          Takes bookings
        </>,
      )}
      {chip(
        filters.saved,
        { saved: !filters.saved },
        <>
          <Heart className={`size-4 ${filters.saved ? "fill-white" : ""}`} aria-hidden />
          Saved
        </>,
      )}
    </div>
  );
}
