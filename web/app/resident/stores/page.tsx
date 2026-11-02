import { ArrowLeft, ChevronDown, Heart, SearchX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCard } from "@/components/app/store-card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StorePage } from "@/lib/types";
import { browseHref, filterQuery, readFilters, StoreChips, StoreSearch } from "./store-browse";

export const metadata: Metadata = { title: "Stores" };

/** Stores shown at first and added by each "Show more" */
const PAGE_SIZE = 20;
const MAX_SHOWN = 200;

export default function StoresPage({ searchParams }: PageProps<"/resident/stores">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <StoreList searchParams={searchParams} />
    </Suspense>
  );
}

const SORT_LABEL = { nearest: "Nearest", rating: "Top rated", name: "A–Z" } as const;

async function StoreList({ searchParams }: Pick<PageProps<"/resident/stores">, "searchParams">) {
  await requireRole("RESIDENT");
  const params = await searchParams;
  const filters = readFilters(params);
  // "Show more" asks for a longer first page, so the list stays one server-rendered page
  // that Back, refresh and live updates all keep as it was
  const shown = Math.min(MAX_SHOWN, Math.max(PAGE_SIZE, Math.ceil((Number(params.show) || 0) / PAGE_SIZE) * PAGE_SIZE));
  const query = filterQuery(filters);
  query.set("limit", String(shown));
  const { stores, total, openCount } = await serverApi<StorePage>(`/stores?${query}`);

  // Without a pinned delivery address there's nothing to measure from, so no "Nearest"
  const canMeasure = stores.some((s) => s.distanceKm !== null);
  const sort = filters.sort ?? (canMeasure ? "nearest" : "name");
  const sorts = (canMeasure ? ["nearest", "rating", "name"] : ["rating", "name"]) as (keyof typeof SORT_LABEL)[];
  const filtered = Boolean(filters.q || filters.type || filters.bookable || filters.saved || filters.open);
  const title = filters.q
    ? `Results for “${filters.q}”`
    : filters.saved
      ? "Your saved stores"
      : filters.bookable
        ? "Stores that take bookings"
        : filters.type
          ? STORE_TYPE_OPTIONS.find((o) => o.value === filters.type)!.label
          : "All stores";
  const option = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap transition ${on ? "bg-ink text-white" : "text-muted hover:text-ink"}`;
  const more = filterQuery(filters);
  more.set("show", String(shown + PAGE_SIZE));

  return (
    <>
      <Link href="/resident" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Home
      </Link>
      <StoreSearch filters={filters} />
      <div className="mt-3">
        <StoreChips filters={filters} />
      </div>

      <div className="mt-6 mb-3">
        <h1 className="text-lg font-bold text-ink">{title}</h1>
        <p className="text-sm text-muted">
          {total} {total === 1 ? "store" : "stores"}
          {!filters.open && total > 0 && ` · ${openCount} open now`}
        </p>
      </div>

      {/* How to order the list, and whether to hide closed stores */}
      <div className="-mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        <div role="group" aria-label="Sort stores" className="flex shrink-0 gap-0.5 rounded-full bg-canvas p-1">
          {sorts.map((value) => (
            <Link key={value} href={browseHref({ ...filters, sort: value })} aria-pressed={sort === value} replace scroll={false} className={option(sort === value)}>
              {SORT_LABEL[value]}
            </Link>
          ))}
        </div>
        <Link
          href={browseHref({ ...filters, open: !filters.open })}
          aria-pressed={filters.open}
          replace
          scroll={false}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
            filters.open ? "border-emerald-600 bg-emerald-600 text-white" : "border-line text-ink hover:border-gray-300"
          }`}
        >
          Open now
        </Link>
      </div>

      {stores.length === 0 ? (
        filters.saved && !filters.q && !filters.type && !filters.bookable ? (
          <EmptyState Icon={Heart} title="No saved stores yet" text="Tap the heart on any store to keep it here for quick ordering." />
        ) : filtered ? (
          <EmptyState Icon={SearchX} title="Nothing found" text="Try another word or store type." />
        ) : (
          <EmptyState Icon={Store} title="No stores yet" text="Stores appear here once an admin approves them. Check back soon!" />
        )
      ) : (
        <>
          <div className="space-y-3">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} href={`/resident/stores/${store.id}`} distance={store.distanceKm} />
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-muted">
            Showing {stores.length} of {total}
          </p>
          {stores.length < total && shown < MAX_SHOWN && (
            <Link
              href={`/resident/stores?${more}`}
              replace
              scroll={false}
              className="mt-2 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink transition hover:bg-canvas"
            >
              Show more
              <ChevronDown className="size-4" aria-hidden />
            </Link>
          )}
          {stores.length < total && shown >= MAX_SHOWN && (
            <p className="mt-2 text-center text-sm text-muted">Search or pick a store type to find the rest.</p>
          )}
        </>
      )}
    </>
  );
}
