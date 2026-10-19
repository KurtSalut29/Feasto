import { CalendarDays, ChevronRight, MapPin, Search, SearchX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCard } from "@/components/app/store-card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { Address, StoreSummary, StoreType } from "@/lib/types";

export const metadata: Metadata = { title: "Home" };

export default function ResidentHomePage({ searchParams }: PageProps<"/resident">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentHome searchParams={searchParams} />
    </Suspense>
  );
}

async function ResidentHome({ searchParams }: Pick<PageProps<"/resident">, "searchParams">) {
  const user = await requireRole("RESIDENT");
  const params = await searchParams;
  const type = STORE_TYPE_OPTIONS.find((o) => o.value === params.type)?.value as StoreType | undefined;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const bookable = params.reservations === "1";

  const query = new URLSearchParams({ ...(type && { type }), ...(q && { q }), ...(bookable && { reservations: "1" }) });
  const [{ stores }, { addresses }] = await Promise.all([
    serverApi<{ stores: StoreSummary[] }>(`/stores?${query}`),
    serverApi<{ addresses: Address[] }>("/me/addresses"),
  ]);
  const address = addresses.find((a) => a.isDefault);
  const chipHref = (value?: string, reservations = bookable) => {
    const next = new URLSearchParams({ ...(value && { type: value }), ...(q && { q }), ...(reservations && { reservations: "1" }) }).toString();
    return next ? `/resident?${next}` : "/resident";
  };

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
          <span className="block truncate text-sm font-semibold text-ink">
            {address ? address.details : "Add a delivery address"}
          </span>
        </span>
        <ChevronRight className="size-5 text-brand-700" aria-hidden />
      </Link>

      <form action="/resident" className="relative mt-4" role="search">
        {type && <input type="hidden" name="type" value={type} />}
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search stores or dishes"
          aria-label="Search stores or dishes"
          className="h-12 w-full rounded-xl border border-line bg-canvas pr-4 pl-12 text-[15px] outline-none placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15"
        />
      </form>

      <nav aria-label="Store types" className="-mx-4 mt-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex w-max gap-2">
          <li>
            <Link
              href={chipHref(type, !bookable)}
              aria-pressed={bookable}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${
                bookable ? "border-brand-600 bg-brand-600 text-white" : "border-brand-500/40 bg-brand-50 text-brand-700"
              }`}
            >
              <CalendarDays className="size-4" aria-hidden />
              Book a table
            </Link>
          </li>
          {[{ value: undefined, label: "All" }, ...STORE_TYPE_OPTIONS].map((option) => {
            const active = option.value === type;
            return (
              <li key={option.label}>
                <Link
                  href={chipHref(option.value)}
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

      <h2 className="mt-7 mb-3 text-lg font-semibold text-ink">
        {q
          ? `Results for “${q}”`
          : bookable
            ? "Stores that take bookings"
            : type
              ? STORE_TYPE_OPTIONS.find((o) => o.value === type)!.label
              : "Stores near you"}
      </h2>
      {stores.length === 0 ? (
        q || type || bookable ? (
          <EmptyState Icon={SearchX} title="Nothing found" text="Try another word or store type." />
        ) : (
          <EmptyState Icon={Store} title="No stores yet" text="Stores appear here once an admin approves them. Check back soon!" />
        )
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} href={`/resident/stores/${store.id}`} />
          ))}
        </div>
      )}
    </>
  );
}
