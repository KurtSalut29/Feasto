import { ChevronRight, Plus, ShoppingCart } from "lucide-react";
import { DeliveryFeeLine } from "@/components/app/delivery-fee";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DishPhoto } from "@/components/app/dish-photo";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { QuantityControl } from "@/components/app/quantity-control";
import { StoreCover } from "@/components/app/store-card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso, formatTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Cart, CartProblem } from "@/lib/types";
import { ClearCartButton } from "./clear-cart-button";

export const metadata: Metadata = { title: "Cart" };

const PROBLEM_TEXT: Record<CartProblem, string> = {
  SOLD_OUT: "Sold out. Remove it to check out.",
  UNAVAILABLE: "Not available right now. Remove it to check out.",
  NOT_ENOUGH_STOCK: "Not enough left. Lower the quantity.",
  STORE_CLOSED: "This store is closed right now.",
  STORE_UNAVAILABLE: "This store isn't taking orders.",
};

export default function ResidentCartPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentCart />
    </Suspense>
  );
}

/**
 * The cart, one card per store, so it's clear who makes what. The total shown is what
 * delivery would cost; pickup is cheaper and chosen at checkout.
 */
async function ResidentCart() {
  await requireRole("RESIDENT");
  const { cart } = await serverApi<{ cart: Cart }>("/cart");

  if (cart.groups.length === 0) {
    return (
      <>
        <MobileHeading title="Your cart" />
        <EmptyState
          Icon={ShoppingCart}
          title="Your cart is empty"
          text="Add dishes from one or more stores, then check out once."
          action={<ButtonLink href="/resident">Browse stores</ButtonLink>}
        />
      </>
    );
  }

  const stores = cart.groups.length;
  const delivery = cart.delivery.addressId ? cart.delivery.total : cart.delivery.baseFee * stores;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Your cart</h1>
          <p className="mt-0.5 text-sm text-muted">
            {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
            {stores > 1 ? ` from ${stores} stores` : ` from ${cart.groups[0].store.name}`}
          </p>
        </div>
        <ClearCartButton />
      </div>

      {stores > 1 && (
        <section aria-labelledby="split-heading" className="mb-4 rounded-2xl bg-brand-50 p-4">
          <h2 id="split-heading" className="text-sm font-semibold text-ink">
            Ordering from {stores} stores
          </h2>
          <ol className="mt-2 space-y-1.5 text-sm text-ink">
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700">1</span>
              You check out once.
            </li>
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700">2</span>
              Each store gets its own order and cooks it at the same time as the others.
            </li>
            <li className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-brand-700">3</span>
              <span>
                Each order comes with its own rider, and each delivery fee follows how far that store is from you. Online, you pay once for all; with cash, you pay each rider their part.
              </span>
            </li>
          </ol>
        </section>
      )}

      <div className="space-y-4">
        {cart.groups.map((group) => (
          <section key={group.store.id} aria-label={group.store.name} className="overflow-hidden rounded-2xl border border-line">
            <Link
              href={`/resident/stores/${group.store.id}`}
              className="flex items-center gap-3 border-b border-line bg-canvas px-4 py-3 transition hover:bg-gray-100"
            >
              <StoreCover imageUrl={group.store.imageUrl} className="size-10 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{group.store.name}</span>
                <span className={`block text-xs font-medium ${group.store.isOpen ? "text-emerald-700" : "text-gray-600"}`}>
                  {group.store.isOpen ? "Open" : `Closed · opens ${formatTime(group.store.opensAt)}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700">
                <Plus className="size-4" aria-hidden />
                Add more
              </span>
            </Link>
            {group.problem && (
              <div className="px-4 pt-3">
                <Alert tone="error">{PROBLEM_TEXT[group.problem]}</Alert>
              </div>
            )}
            <ul className="divide-y divide-line px-4">
              {group.items.map((item) => (
                <li key={item.menuItemId} className="flex gap-3 py-3">
                  <DishPhoto src={item.imageUrl} sizes="56px" className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 leading-snug font-medium text-ink">{item.name}</p>
                    <p className="mt-0.5 text-sm text-muted">{formatPeso(item.price)} each</p>
                    {item.problem && <p className="mt-0.5 text-xs font-semibold text-red-600">{PROBLEM_TEXT[item.problem]}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <QuantityControl key={item.quantity} menuItemId={item.menuItemId} name={item.name} quantity={item.quantity} compact />
                    <p className="text-sm font-semibold text-ink tabular-nums">{formatPeso(item.lineTotal)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="font-semibold text-ink tabular-nums">{formatPeso(group.subtotal)}</span>
            </div>
            {group.delivery && (
              <div className="border-t border-dashed border-line bg-canvas/60 px-4 py-2.5">
                <DeliveryFeeLine quote={group.delivery} />
              </div>
            )}
          </section>
        ))}
      </div>

      <section aria-label="Total" className="mt-5 rounded-2xl border border-line p-4">
        <dl className="space-y-1.5 text-[15px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Items ({cart.itemCount})</dt>
            <dd className="font-semibold text-ink tabular-nums">{formatPeso(cart.itemsTotal)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">
              {cart.delivery.addressId
                ? `Delivery to ${cart.delivery.addressLabel}${stores > 1 ? ` (${stores} stores)` : ""}`
                : `Delivery (from ${formatPeso(cart.delivery.baseFee)} per store)`}
            </dt>
            <dd className="text-ink tabular-nums">{formatPeso(delivery)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-2.5 text-lg font-bold text-ink">
            <dt>Total with delivery</dt>
            <dd className="tabular-nums">{formatPeso(cart.itemsTotal + delivery)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          The delivery fee depends on the distance by road{cart.groups.some((g) => g.delivery?.peak) ? " and the rush hour" : ""}. Pickup is free: choose it at checkout to pay{" "}
          {formatPeso(cart.itemsTotal)} only.
        </p>
      </section>

      {/* Room so the bar below never covers the total */}
      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+1rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-[440px] px-4">
        {cart.hasProblems ? (
          <p className="rounded-2xl bg-red-50 px-4 py-4 text-center text-sm font-medium text-red-700 shadow-lg ring-1 ring-red-100">
            Fix the items marked in red to check out.
          </p>
        ) : (
          <Link
            href="/resident/checkout"
            className="flex h-16 items-center justify-between gap-3 rounded-2xl bg-brand-600 px-4 text-white shadow-[0_12px_28px_-10px_rgba(210,70,0,0.6)] transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span>
              <span className="block text-[11px] leading-tight text-white/75">Total with delivery</span>
              <span className="block text-lg leading-tight font-bold tabular-nums">{formatPeso(cart.itemsTotal + delivery)}</span>
            </span>
            <span className="flex items-center gap-1 font-semibold">
              Go to checkout
              <ChevronRight className="size-5" aria-hidden />
            </span>
          </Link>
        )}
      </div>
    </>
  );
}
