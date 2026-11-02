import { CalendarDays, Heart, Search } from "lucide-react";
import Link from "next/link";
import { STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StoreType } from "@/lib/types";

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

/** Search box. Searching always opens the store list, wherever it's typed. */
export function StoreSearch({ filters, autoFocus }: { filters: BrowseFilters; autoFocus?: boolean }) {
  return (
    <form action="/resident/stores" className="relative" role="search">
      {[...filterQuery({ ...filters, q: "" })].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={filters.q}
        autoFocus={autoFocus}
        placeholder="Search stores or dishes"
        aria-label="Search stores or dishes"
        className="h-12 w-full rounded-xl border border-line bg-canvas pr-4 pl-12 text-[15px] outline-none placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
      />
    </form>
  );
}

const toggleChip = (on: boolean) =>
  `flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${
    on ? "border-brand-600 bg-brand-600 text-white" : "border-brand-500/40 bg-brand-50 text-brand-700 hover:border-brand-500"
  }`;

/**
 * Saved, Book a table and the store types, in one sideways row. On Home they open the list
 * with that filter; on the list they switch it on or off.
 */
export function StoreChips({ filters, showAll = true }: { filters: BrowseFilters; showAll?: boolean }) {
  const types = showAll ? [{ value: undefined, label: "All" }, ...STORE_TYPE_OPTIONS] : STORE_TYPE_OPTIONS;
  return (
    <nav aria-label="Store types" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex w-max gap-2">
        <li>
          <Link href={browseHref({ ...filters, saved: !filters.saved })} aria-pressed={filters.saved} className={toggleChip(filters.saved)}>
            <Heart className={`size-4 ${filters.saved ? "fill-white" : ""}`} aria-hidden />
            Saved
          </Link>
        </li>
        <li>
          <Link href={browseHref({ ...filters, bookable: !filters.bookable })} aria-pressed={filters.bookable} className={toggleChip(filters.bookable)}>
            <CalendarDays className="size-4" aria-hidden />
            Book a table
          </Link>
        </li>
        {types.map((option) => {
          const active = showAll && option.value === filters.type;
          return (
            <li key={option.label}>
              <Link
                href={browseHref({ ...filters, type: option.value as StoreType | undefined })}
                aria-current={active ? "page" : undefined}
                className={`block rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${
                  active ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-gray-300"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
