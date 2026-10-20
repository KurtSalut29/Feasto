import { CalendarDays, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { StoreSummary } from "@/lib/types";
import { FavoriteButton } from "./favorite-button";
import { RatingBadge } from "./rating";

/** Cover photo, or a soft placeholder when the store hasn't uploaded one. */
export function StoreCover({ imageUrl, className = "", eager }: { imageUrl: string | null; className?: string; eager?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-brand-50 ${className}`}>
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill unoptimized loading={eager ? "eager" : "lazy"} className="object-cover" />
      ) : (
        <Store className="absolute inset-0 m-auto size-9 text-brand-600/30" aria-hidden />
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

/**
 * A store in the browse list. The whole card opens the store; the heart sits on top of
 * the photo as its own button (a button can't go inside a link, so the link is stretched).
 */
export function StoreCard({ store, href, showFavorite = true }: { store: StoreSummary; href: string; showFavorite?: boolean }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(31,45,61,0.35)] has-focus-visible:outline-2 has-focus-visible:outline-brand-500">
      <div className="relative">
        <StoreCover imageUrl={store.imageUrl} className={`aspect-[16/7] ${store.isOpen ? "" : "opacity-60 grayscale"}`} />
        <div className="absolute top-2.5 left-2.5">
          <OpenBadge isOpen={store.isOpen} opensAt={store.opensAt} />
        </div>
        {store.acceptsReservations && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-ink shadow-sm">
            <CalendarDays className="size-3.5 text-brand-600" aria-hidden />
            Takes bookings
          </span>
        )}
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-semibold leading-snug text-ink">
            <Link href={href} className="outline-none after:absolute after:inset-0 after:content-['']">
              {store.name}
            </Link>
          </h3>
          <RatingBadge rating={store.rating} count={store.ratingCount} className="shrink-0" />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {STORE_TYPE_LABEL[store.storeType]} · {store.address}
        </p>
        {store.matchedDishes.length > 0 ? (
          <p className="mt-1.5 truncate text-sm font-medium text-brand-700">Has {store.matchedDishes.join(", ")}</p>
        ) : (
          store.categories.length > 0 && <p className="mt-1.5 truncate text-[13px] text-gray-500">{store.categories.join(" · ")}</p>
        )}
      </div>
      {showFavorite && (
        // Above the stretched link so tapping the heart doesn't open the store
        <div className="absolute top-2 right-2 z-10">
          <FavoriteButton key={String(store.isFavorite)} storeId={store.id} storeName={store.name} isFavorite={store.isFavorite} />
        </div>
      )}
    </article>
  );
}
