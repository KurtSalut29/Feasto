import { Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { StoreSummary } from "@/lib/types";

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
    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
      {opensAt ? `Closed · opens ${formatTime(opensAt)}` : "Closed"}
    </span>
  );
}

export function StoreCard({ store, href }: { store: StoreSummary; href: string }) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-2xl border border-line bg-white transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <StoreCover imageUrl={store.imageUrl} className={`aspect-[16/8] ${store.isOpen ? "" : "opacity-60 grayscale"}`} />
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold leading-snug text-ink">{store.name}</p>
          <OpenBadge isOpen={store.isOpen} opensAt={store.opensAt} />
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {STORE_TYPE_LABEL[store.storeType]} · {store.address}
        </p>
        {store.matchedDishes.length > 0 ? (
          <p className="mt-1.5 truncate text-sm text-brand-700">Has {store.matchedDishes.join(", ")}</p>
        ) : (
          store.categories.length > 0 && <p className="mt-1.5 truncate text-sm text-muted">{store.categories.join(" · ")}</p>
        )}
      </div>
    </Link>
  );
}
