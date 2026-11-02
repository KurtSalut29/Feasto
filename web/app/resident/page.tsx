import { ChevronRight, MapPin, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreTile } from "@/components/app/store-card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { Address, StoreSections, StoreSummary } from "@/lib/types";
import { browseHref, filterQuery, NO_FILTERS, readFilters, StoreChips, StoreSearch } from "./stores/store-browse";

export const metadata: Metadata = { title: "Home" };

export default function ResidentHomePage({ searchParams }: PageProps<"/resident">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentHome searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Home is a short page however many stores Feasto has: a few stores per row (order again,
 * near you, top rated, saved), each row scrolling sideways, and "See all" for the full list.
 */
async function ResidentHome({ searchParams }: Pick<PageProps<"/resident">, "searchParams">) {
  // Searches and filters live on the store list now; old links like /resident?q=adobo go there
  const old = filterQuery(readFilters(await searchParams)).toString();
  if (old) redirect(`/resident/stores?${old}`);

  const user = await requireRole("RESIDENT");
  const [sections, { addresses }] = await Promise.all([
    serverApi<StoreSections>("/stores/sections"),
    serverApi<{ addresses: Address[] }>("/me/addresses"),
  ]);
  const address = addresses.find((a) => a.isDefault);

  return (
    <>
      <h1 className="text-[22px] font-bold tracking-tight text-ink">Hi, {user.name.split(" ")[0]}!</h1>
      <p className="mt-0.5 text-sm text-muted">What would you like to eat today?</p>

      <Link
        href="/resident/addresses"
        className="mt-4 flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 transition hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <MapPin className="size-5 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-brand-700">Deliver to {address ? address.label : ""}</span>
          <span className="block truncate text-sm font-semibold text-ink">{address ? address.details : "Add a delivery address"}</span>
        </span>
        <ChevronRight className="size-5 text-brand-700" aria-hidden />
      </Link>

      <div className="mt-4">
        <StoreSearch filters={NO_FILTERS} />
      </div>
      <div className="mt-3">
        <StoreChips filters={NO_FILTERS} showAll={false} />
      </div>

      {sections.total === 0 ? (
        <div className="mt-7">
          <EmptyState Icon={Store} title="No stores yet" text="Stores appear here once an admin approves them. Check back soon!" />
        </div>
      ) : (
        <>
          <StoreRow title="Order again" stores={sections.orderAgain} />
          <StoreRow
            title={sections.hasStartingPoint ? "Near you" : "Stores"}
            subtitle={`${sections.openCount} open now`}
            stores={sections.nearby}
            seeAll={{ href: browseHref(NO_FILTERS), label: `See all ${sections.total}` }}
          />
          <StoreRow title="Top rated" stores={sections.topRated} seeAll={{ href: browseHref({ ...NO_FILTERS, sort: "rating" }), label: "See all" }} />
          <StoreRow
            title="Your saved stores"
            stores={sections.saved}
            seeAll={sections.savedCount > sections.saved.length ? { href: browseHref({ ...NO_FILTERS, saved: true }), label: "See all" } : undefined}
          />

          <Link
            href={browseHref(NO_FILTERS)}
            className="mt-7 flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5 transition hover:bg-canvas"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Store className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Browse all {sections.total} stores</span>
              <span className="block text-sm text-muted">Search, sort and filter</span>
            </span>
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Link>
        </>
      )}
    </>
  );
}

/** A titled row of store tiles that scrolls sideways. Rows with no stores aren't shown. */
function StoreRow({
  title,
  subtitle,
  stores,
  seeAll,
}: {
  title: string;
  subtitle?: string;
  stores: StoreSummary[];
  seeAll?: { href: string; label: string };
}) {
  if (stores.length === 0) return null;
  return (
    <section className="mt-7" aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {seeAll && (
          <Link href={seeAll.href} className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline">
            {seeAll.label}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {stores.map((store) => (
          <li key={store.id} className="contents">
            <StoreTile store={store} href={`/resident/stores/${store.id}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
