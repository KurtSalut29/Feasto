import { ArrowLeft, CalendarDays, Clock, MapPin, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { QuantityControl } from "@/components/app/quantity-control";
import { OpenBadge, StoreCover } from "@/components/app/store-card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso, formatTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { Cart, MenuItem, StoreDetail } from "@/lib/types";

export const metadata: Metadata = { title: "Store" };

export default function StorePage({ params }: PageProps<"/resident/stores/[id]">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <StoreView params={params} />
    </Suspense>
  );
}

function DishRow({ item, quantity, storeOpen }: { item: MenuItem; quantity: number; storeOpen: boolean }) {
  const soldOut = !item.isAvailable || item.stock === 0;
  return (
    <li className="flex gap-3 py-4">
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${soldOut ? "text-muted" : "text-ink"}`}>{item.name}</p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.description}</p>}
        <p className="mt-1.5 font-semibold text-ink">{formatPeso(item.price)}</p>
        {soldOut ? (
          <p className="mt-0.5 text-xs font-semibold text-red-600">Sold out</p>
        ) : (
          item.stock !== null && item.stock <= 5 && <p className="mt-0.5 text-xs font-semibold text-amber-700">Only {item.stock} left</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {item.imageUrl && (
          <span className="relative size-20 overflow-hidden rounded-xl bg-canvas">
            <Image src={item.imageUrl} alt="" fill unoptimized className={`object-cover ${soldOut ? "grayscale" : ""}`} />
          </span>
        )}
        {!soldOut && <QuantityControl key={quantity} menuItemId={item.id} name={item.name} quantity={quantity} disabled={!storeOpen} compact />}
      </div>
    </li>
  );
}

async function StoreView({ params }: Pick<PageProps<"/resident/stores/[id]">, "params">) {
  await requireRole("RESIDENT");
  const { id } = await params;
  const [{ store }, { cart }] = await Promise.all([
    serverApi<{ store: StoreDetail }>(`/stores/${id}`),
    serverApi<{ cart: Cart }>("/cart"),
  ]);
  const inCart = new Map(cart.groups.flatMap((g) => g.items.map((i) => [i.menuItemId, i.quantity] as const)));
  const sections = [...new Set(store.menuItems.map((i) => i.category))];
  const cartCount = cart.groups.find((g) => g.store.id === store.id)?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;

  return (
    <>
      <div className="-mx-4 -mt-5">
        <div className="relative">
          <StoreCover imageUrl={store.imageUrl} className="aspect-[16/9]" eager />
          <Link
            href="/resident"
            aria-label="Back to stores"
            className="absolute top-3 left-3 flex size-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{store.name}</h1>
          <p className="text-sm text-muted">{STORE_TYPE_LABEL[store.storeType]}</p>
        </div>
        <OpenBadge isOpen={store.isOpen} />
      </div>
      {store.description && <p className="mt-2 text-[15px] text-ink">{store.description}</p>}
      <div className="mt-3 space-y-1.5 text-sm text-muted">
        <p className="flex items-center gap-2">
          <Clock className="size-4 shrink-0" aria-hidden />
          {formatTime(store.opensAt)} – {formatTime(store.closesAt)}
        </p>
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          {store.address}
        </p>
      </div>

      {store.canBook && (
        <ButtonLink href={`/resident/stores/${store.id}/book`} variant="secondary" className="mt-4 w-full">
          <CalendarDays className="size-5" aria-hidden />
          Book a table
        </ButtonLink>
      )}

      {!store.isOpen && (
        <div className="mt-4">
          <Alert tone="pending" title="Closed right now">
            You can look at the menu, but ordering opens at {formatTime(store.opensAt)}.
          </Alert>
        </div>
      )}

      {store.menuItems.length === 0 ? (
        <EmptyState Icon={UtensilsCrossed} title="No dishes yet" text="This store hasn't added its menu yet." />
      ) : (
        <div className="mt-2">
          {sections.map((section) => (
            <section key={section} className="mt-5">
              <h2 className="text-lg font-semibold text-ink">{section}</h2>
              <ul className="divide-y divide-line">
                {store.menuItems
                  .filter((i) => i.category === section)
                  .map((item) => (
                    <DishRow key={item.id} item={item} quantity={inCart.get(item.id) ?? 0} storeOpen={store.isOpen} />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-10 mx-auto max-w-[440px] px-4">
          <ButtonLink href="/resident/cart" className="w-full shadow-lg">
            View cart · {cartCount} {cartCount === 1 ? "item" : "items"}
          </ButtonLink>
        </div>
      )}
    </>
  );
}
