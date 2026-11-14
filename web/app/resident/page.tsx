import { CalendarDays, ChevronRight, Heart, Store, type LucideIcon } from "lucide-react";
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
import { HomeHero } from "./home-hero";
import { browseHref, filterQuery, NO_FILTERS, readFilters, StoreSearch } from "./stores/store-browse";
import { StaggerOnce } from "@/components/app/stagger-once";

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

  return (
    <>
      <HomeHero firstName={user.name.split(" ")[0]} addresses={addresses} />

      {/* Big screens search from the top bar */}
      <div className="mt-4 lg:hidden">
        <StoreSearch filters={NO_FILTERS} />
      </div>

      {sections.total === 0 ? (
        <div className="mt-7">
          <EmptyState Icon={Store} title="No stores yet" text="Stores appear here once an admin approves them. Check back soon!" />
        </div>
      ) : (
        <StaggerOnce>
          <section className="mt-6 md:mt-8" aria-label="Categories">
            <SectionHeading title="Categories" seeAll={{ href: browseHref(NO_FILTERS), label: `All ${sections.total} stores` }} />
            <CategoryGrid categories={sections.categories} />
            <div className="mt-4 grid grid-cols-2 gap-3 md:max-w-md">
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
        </StaggerOnce>
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
    <section className="mt-7 md:mt-10" aria-label={title}>
      <SectionHeading title={title} subtitle={subtitle} seeAll={seeAll} />
      {/* Phones: a row that scrolls sideways. Big screens: a grid of the first ones, "See all" for the rest. */}
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 md:[&>li:nth-child(n+9)]:hidden lg:grid-cols-6 lg:gap-4 lg:[&>li:nth-child(n+7)]:hidden">
        {stores.map((store) => (
          <li key={store.id} className="contents">
            <StoreTile store={store} href={`/resident/stores/${store.id}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}
