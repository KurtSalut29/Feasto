import { CalendarDays, ChevronRight, Heart, MapPin, Store, type LucideIcon } from "lucide-react";
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
import { CategoryGrid } from "./category-grid";
import { browseHref, filterQuery, NO_FILTERS, readFilters, StoreSearch } from "./stores/store-browse";

export const metadata: Metadata = { title: "Home" };

export default function ResidentHomePage({ searchParams }: PageProps<"/resident">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentHome searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Home answers "what can I get here?" first, with the kinds of stores. Below that, a few stores
 * per row (order again, near you, top rated, saved), each saying what it is and scrolling
 * sideways, so the page stays short however many stores Feasto has.
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

      {sections.total === 0 ? (
        <div className="mt-7">
          <EmptyState Icon={Store} title="No stores yet" text="Stores appear here once an admin approves them. Check back soon!" />
        </div>
      ) : (
        <>
          <section className="mt-6" aria-label="Categories">
            <SectionHeading title="Categories" seeAll={{ href: browseHref(NO_FILTERS), label: `All ${sections.total} stores` }} />
            <CategoryGrid categories={sections.categories} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Shortcut href={browseHref({ ...NO_FILTERS, bookable: true })} Icon={CalendarDays} label="Book a table" />
              <Shortcut href="/resident/saved" Icon={Heart} label="Saved stores" />
            </div>
          </section>

          <StoreRow title="Order again" subtitle="Stores you've ordered from" stores={sections.orderAgain} />
          <StoreRow
            title={sections.hasStartingPoint ? "Near you" : "Stores on Feasto"}
            subtitle={`${sections.hasStartingPoint ? "Closest to your delivery address · " : ""}${sections.openCount} open now`}
            stores={sections.nearby}
            seeAll={{ href: browseHref(NO_FILTERS), label: "See all" }}
          />
          <StoreRow title="Top rated" subtitle="Residents' highest-rated stores" stores={sections.topRated} seeAll={{ href: browseHref({ ...NO_FILTERS, sort: "rating" }), label: "See all" }} />
          <StoreRow
            title="Your saved stores"
            subtitle="Stores you tapped the heart on"
            stores={sections.saved}
            seeAll={{ href: "/resident/saved", label: sections.savedCount > sections.saved.length ? `See all ${sections.savedCount}` : "See all" }}
          />
        </>
      )}
    </>
  );
}

function SectionHeading({ title, subtitle, seeAll }: { title: string; subtitle?: string; seeAll?: { href: string; label: string } }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
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
  );
}

function Shortcut({ href, Icon, label }: { href: string; Icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <Icon className="size-4 text-brand-600" aria-hidden />
      {label}
    </Link>
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
      <SectionHeading title={title} subtitle={subtitle} seeAll={seeAll} />
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
