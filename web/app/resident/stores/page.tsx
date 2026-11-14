import { ChevronDown, Heart, SearchX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCard } from "@/components/app/store-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StorePage } from "@/lib/types";
import { CategoryTabs } from "./category-tabs";
import { browseHref, type BrowseFilters, filterQuery, NO_FILTERS, readFilters, StoreFilters, StoreSearch } from "./store-browse";

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

function pageTitle({ q, type, saved, bookable }: BrowseFilters) {
  if (q) return `Results for “${q}”`;
  if (type) return STORE_TYPE_LABEL[type];
  if (saved) return "Your saved stores";
  if (bookable) return "Stores that take bookings";
  return "All stores";
}

const storeCount = (n: number) => `${n} ${n === 1 ? "store" : "stores"}`;

/**
 * Every way into the stores ends here, and the page reads in the order a resident asks:
 * where am I, what else is there, how do I narrow it, then the stores themselves.
 */
async function StoreList({ searchParams }: Pick<PageProps<"/resident/stores">, "searchParams">) {
  await requireRole("RESIDENT");
  const params = await searchParams;
  const filters = readFilters(params);
  // "Show more" asks for a longer first page, so the list stays one server-rendered page
  // that Back, refresh and live updates all keep as it was
  const shown = Math.min(MAX_SHOWN, Math.max(PAGE_SIZE, Math.ceil((Number(params.show) || 0) / PAGE_SIZE) * PAGE_SIZE));
  const query = filterQuery(filters);
  query.set("limit", String(shown));
  const { stores, total, openCount, typeCounts } = await serverApi<StorePage>(`/stores?${query}`);

  // Without a pinned delivery address there's nothing to measure from, so no "Nearest"
  const canMeasure = stores.some((s) => s.distanceKm !== null);
  const sort = filters.sort ?? (canMeasure ? "nearest" : "name");
  const more = filterQuery(filters);
  more.set("show", String(shown + PAGE_SIZE));

  const totalAnyType = Object.values(typeCounts).reduce((sum, n) => sum + n, 0);
  // Only kinds that have something to show, plus the chosen one so the page still says where it is
  const tabs = [
    { label: "All", count: totalAnyType, href: browseHref({ ...filters, type: undefined }), active: !filters.type },
    ...STORE_TYPE_OPTIONS.filter((o) => typeCounts[o.value] || o.value === filters.type).map((o) => ({
      label: o.label,
      count: typeCounts[o.value] ?? 0,
      href: browseHref({ ...filters, type: o.value }),
      active: o.value === filters.type,
    })),
  ];

  return (
    <>
      <div>
        <div className="min-w-0">
          <h1 className="text-[1.375rem] leading-tight font-bold tracking-tight [overflow-wrap:anywhere] text-ink">{pageTitle(filters)}</h1>
          {total > 0 && (
            <p className="mt-0.5 text-sm text-muted">
              {storeCount(total)}
              {filters.q && filters.type && ` in ${STORE_TYPE_LABEL[filters.type]}`}
              {!filters.open && ` · ${openCount} open now`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3">
        <StoreSearch filters={filters} />
      </div>
      <div className="mt-2">
        <CategoryTabs tabs={tabs} />
      </div>
      <div className="mt-3">
        <StoreFilters filters={filters} sort={total > 1 ? sort : undefined} canMeasure={canMeasure} />
      </div>

      {stores.length === 0 ? (
        <NoStores filters={filters} totalAnyType={totalAnyType} />
      ) : (
        <>
          {/* Screen readers jump between stores by heading: each store's name is a level 3 under this */}
          <h2 className="sr-only">
            {total} {total === 1 ? "store" : "stores"}
          </h2>
          <div className="mt-1 divide-y divide-line md:mt-3 md:grid md:grid-cols-3 md:gap-4 md:divide-y-0 lg:grid-cols-4">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} href={`/resident/stores/${store.id}`} showType={!filters.type} />
            ))}
          </div>
          {stores.length < total && (
            <p className="mt-4 text-center text-sm text-muted">
              Showing {stores.length} of {total}
            </p>
          )}
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

/** Says why the list is empty and offers the way out, so nothing here is a dead end. */
function NoStores({ filters, totalAnyType }: { filters: BrowseFilters; totalAnyType: number }) {
  const { q, type, open, bookable, saved, sort } = filters;
  const label = type && STORE_TYPE_LABEL[type];

  if (q && label && totalAnyType > 0) {
    return (
      <EmptyState
        Icon={SearchX}
        title={`No “${q}” in ${label}`}
        text={`${storeCount(totalAnyType)} in other categories ${totalAnyType === 1 ? "has" : "have"} it.`}
        action={<ButtonLink href={browseHref({ ...filters, type: undefined })}>See {totalAnyType === 1 ? "it" : "them"}</ButtonLink>}
      />
    );
  }
  if (q) {
    return (
      <EmptyState
        Icon={SearchX}
        title={`No results for “${q}”`}
        text="Check the spelling, or try a store name or a dish."
        action={
          <ButtonLink href={browseHref({ ...filters, q: "" })} variant="secondary">
            Clear search
          </ButtonLink>
        }
      />
    );
  }
  if (saved && !type && !open && !bookable) {
    return <EmptyState Icon={Heart} title="No saved stores yet" text="Tap the heart on any store to keep it here for quick ordering." />;
  }
  if (open || bookable || saved) {
    return (
      <EmptyState
        Icon={SearchX}
        title={label ? `No ${label} stores match these filters` : "No stores match these filters"}
        text="Turn off a filter to see more."
        action={
          <ButtonLink href={browseHref({ ...NO_FILTERS, type, sort })} variant="secondary">
            Clear filters
          </ButtonLink>
        }
      />
    );
  }
  if (label) {
    return (
      <EmptyState
        Icon={Store}
        title={`No ${label} stores yet`}
        text="Stores appear here once an admin approves them."
        action={
          <ButtonLink href={browseHref(NO_FILTERS)} variant="secondary">
            See all stores
          </ButtonLink>
        }
      />
    );
  }
  return <EmptyState Icon={Store} title="No stores yet" text="Stores appear here once an admin approves them. Check back soon!" />;
}
