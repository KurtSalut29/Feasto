import { CalendarDays, Heart, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FavoriteButton } from "@/components/app/favorite-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { RatingBadge } from "@/components/app/rating";
import { StoreCover } from "@/components/app/store-card";
import { storeState } from "@/components/app/store-status";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatDistance } from "@/lib/geo";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_ICON } from "@/lib/store-type-icons";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { StorePage, StoreSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Saved stores" };

export default function SavedStoresPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <SavedStores />
    </Suspense>
  );
}

/**
 * The stores a resident hearted, as big tiles to order from again in one tap. Open stores come
 * first, so the top of the page is always somewhere that can take an order now.
 */
async function SavedStores() {
  await requireRole("RESIDENT");
  const { stores, total } = await serverApi<StorePage>("/stores?favorites=1&limit=200");
  const sorted = [...stores].sort((a, b) => Number(storeState(b).open) - Number(storeState(a).open) || a.name.localeCompare(b.name));
  const open = sorted.filter((s) => storeState(s).open).length;

  if (total === 0) {
    return (
      <>
        <MobileHeading title="Saved stores" />
        <EmptyState
          Icon={Heart}
          title="No saved stores yet"
          text="Tap the heart on any store and it stays here, so your favorites are one tap away."
          action={<ButtonLink href="/resident/stores">Browse stores</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <MobileHeading title="Saved stores" subtitle={`${total} saved · ${open} open now. Tap the heart to remove one.`} />
      <ul className="grid grid-cols-2 gap-3">
        {sorted.map((store) => (
          <SavedTile key={store.id} store={store} />
        ))}
      </ul>
    </>
  );
}

function SavedTile({ store }: { store: StoreSummary }) {
  const { open, label } = storeState(store);
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-[0_12px_28px_-16px_rgba(31,45,61,0.35)] has-[a.stretch:focus-visible]:outline-2 has-[a.stretch:focus-visible]:outline-brand-500">
      <div className="relative">
        <StoreCover imageUrl={store.imageUrl} Icon={STORE_TYPE_ICON[store.storeType]} className={`aspect-[4/3] ${open ? "" : "opacity-60 grayscale"}`} />
        <span
          className={`absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${
            open ? "bg-white/95 text-emerald-700" : "bg-white/95 text-gray-700"
          }`}
        >
          <span className={`size-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden />
          {open ? "Open" : label.replace("Closed · ", "")}
        </span>
      </div>
      {/* Above the stretched link, so tapping the heart doesn't open the store */}
      <div className="absolute top-1.5 right-1.5 z-10">
        <FavoriteButton storeId={store.id} storeName={store.name} isFavorite />
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <h2 className="truncate text-sm leading-snug font-semibold text-ink">
          <Link href={`/resident/stores/${store.id}`} className="stretch outline-none after:absolute after:inset-0 after:content-['']">
            {store.name}
          </Link>
        </h2>
        <p className="mt-0.5 truncate text-xs text-muted">
          {store.distanceKm !== null && <span className="font-medium text-ink">{formatDistance(store.distanceKm)} · </span>}
          {STORE_TYPE_LABEL[store.storeType]}
        </p>
        <RatingBadge rating={store.rating} count={store.ratingCount} className="mt-1" />
        <div className="relative z-10 mt-auto flex gap-1.5 pt-2.5">
          <Link
            href={`/resident/stores/${store.id}`}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 text-xs font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <UtensilsCrossed className="size-3.5" aria-hidden />
            Order
          </Link>
          {store.acceptsReservations && (
            <Link
              href={`/resident/stores/${store.id}/book`}
              aria-label={`Book a table at ${store.name}`}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <CalendarDays className="size-3.5 text-brand-600" aria-hidden />
              Book
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
