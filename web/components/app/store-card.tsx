import { CalendarDays, Store, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { STORE_TYPE_ICON } from "@/lib/store-type-icons";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { StoreSummary } from "@/lib/types";
import { FavoriteButton } from "./favorite-button";
import { RatingBadge } from "./rating";
import { storeState } from "./store-status";

/** Cover photo, or a soft placeholder when the store hasn't uploaded one. */
export function StoreCover({ imageUrl, className = "", eager, Icon = Store }: { imageUrl: string | null; className?: string; eager?: boolean; Icon?: LucideIcon }) {
  return (
    <div className={`relative overflow-hidden bg-brand-50 ${className}`}>
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill unoptimized loading={eager ? "eager" : "lazy"} className="object-cover" />
      ) : (
        <Icon className="absolute inset-0 m-auto size-9 text-brand-600/40" aria-hidden />
      )}
    </div>
  );
}

export function OpenBadge({ isOpen, opensAt }: { isOpen: boolean; opensAt?: string }) {
  return isOpen ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
      Open
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
      {opensAt ? `Closed · opens ${formatTime(opensAt)}` : "Closed"}
    </span>
  );
}

/** A small store card for the home screen's sideways rows. */
export function StoreTile({ store, href }: { store: StoreSummary; href: string }) {
  return (
    <article className="group relative w-44 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-[0_12px_28px_-16px_rgba(31,45,61,0.35)] has-focus-visible:outline-2 has-focus-visible:outline-brand-500">
      <div className="relative">
        <StoreCover imageUrl={store.imageUrl} Icon={STORE_TYPE_ICON[store.storeType]} className={`aspect-[4/3] ${store.isOpen ? "" : "opacity-60 grayscale"}`} />
        {!store.isOpen && (
          <span className="absolute top-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-700 shadow-sm">Closed</span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="truncate text-sm font-semibold leading-snug text-ink">
          <Link href={href} className="outline-none after:absolute after:inset-0 after:content-['']">
            {store.name}
          </Link>
        </h3>
        <p className="mt-1 truncate text-xs text-muted">
          {store.distanceKm !== null && <span className="font-medium text-ink">{formatDistance(store.distanceKm)} · </span>}
          {STORE_TYPE_LABEL[store.storeType]}
        </p>
        <RatingBadge rating={store.rating} count={store.ratingCount} className="mt-1.5" />
      </div>
    </article>
  );
}

/**
 * A store in the browse list: one row, so several fit on a phone and are easy to compare. It leads
 * with what decides an order: rating and distance, whether it's open, then what it serves.
 * The whole row opens the store; the heart is its own button (a button can't go inside a link,
 * so the link is stretched).
 */
export function StoreCard({
  store,
  href,
  showType = true,
}: {
  store: StoreSummary;
  href: string;
  /** Left out on a category's own page, where every store is that kind */
  showType?: boolean;
}) {
  const { open, label } = storeState(store);
  const serves = [showType && STORE_TYPE_LABEL[store.storeType], ...store.categories].filter(Boolean).join(" · ");
  return (
    <article className="group relative flex gap-3 py-3 has-focus-visible:rounded-xl has-focus-visible:outline-2 has-focus-visible:outline-brand-500">
      <StoreCover
        imageUrl={store.imageUrl}
        Icon={STORE_TYPE_ICON[store.storeType]}
        className={`size-24 shrink-0 rounded-xl ${open ? "" : "opacity-60 grayscale"}`}
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate pr-8 font-semibold leading-snug text-ink group-hover:text-brand-700">
          <Link href={href} className="outline-none after:absolute after:inset-0 after:content-['']">
            {store.name}
          </Link>
        </h3>
        <div className="mt-1 flex items-center gap-1.5 pr-1 text-sm text-muted">
          <RatingBadge rating={store.rating} count={store.ratingCount} className="shrink-0" />
          <span aria-hidden>·</span>
          {store.distanceKm !== null ? (
            <span className="shrink-0 font-medium text-ink">{formatDistance(store.distanceKm)}</span>
          ) : (
            <span className="truncate">{store.address}</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
          <span className={`inline-flex items-center gap-1.5 font-medium ${open ? "text-emerald-700" : "text-gray-600"}`}>
            <span className={`size-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden />
            {open ? `Open until ${formatTime(store.closesAt)}` : label}
          </span>
          {store.acceptsReservations && (
            <span className="inline-flex items-center gap-1 text-muted">
              <CalendarDays className="size-3.5 text-brand-600" aria-hidden />
              <span className="sr-only">Takes </span>Bookings
            </span>
          )}
        </div>
        {store.matchedDishes.length > 0 ? (
          <p className="mt-1 truncate text-[13px] font-medium text-brand-700">Has {store.matchedDishes.join(", ")}</p>
        ) : (
          serves && <p className="mt-1 truncate text-[13px] text-gray-500">{serves}</p>
        )}
      </div>
      {/* Above the stretched link so tapping the heart doesn't open the store */}
      <div className="absolute top-1 -right-2.5 z-10">
        <FavoriteButton key={String(store.isFavorite)} storeId={store.id} storeName={store.name} isFavorite={store.isFavorite} plain />
      </div>
    </article>
  );
}
