import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { QuantityControl } from "@/components/app/quantity-control";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
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

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Your cart</h1>
          <p className="mt-0.5 text-sm text-muted">
            {cart.groups.length > 1
              ? `From ${cart.groups.length} stores. Each store prepares its part at the same time.`
              : "Check your order before paying."}
          </p>
        </div>
        <ClearCartButton />
      </div>

      <div className="space-y-4">
        {cart.groups.map((group) => (
          <section key={group.store.id} className="overflow-hidden rounded-2xl border border-line">
            <Link
              href={`/resident/stores/${group.store.id}`}
              className="flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3"
            >
              <span className="font-semibold text-ink">{group.store.name}</span>
              <span className="text-sm text-muted">{formatPeso(group.subtotal)}</span>
            </Link>
            {group.problem && (
              <div className="px-4 pt-3">
                <Alert tone="error">{PROBLEM_TEXT[group.problem]}</Alert>
              </div>
            )}
            <ul className="divide-y divide-line px-4">
              {group.items.map((item) => (
                <li key={item.menuItemId} className="flex items-center gap-3 py-3">
                  {item.imageUrl && (
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-canvas">
                      <Image src={item.imageUrl} alt="" fill unoptimized className="object-cover" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{item.name}</p>
                    <p className="text-sm text-muted">{formatPeso(item.price)} each</p>
                    {item.problem && <p className="text-xs font-semibold text-red-600">{PROBLEM_TEXT[item.problem]}</p>}
                  </div>
                  <QuantityControl
                    key={item.quantity}
                    menuItemId={item.menuItemId}
                    name={item.name}
                    quantity={item.quantity}
                    compact
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-line p-4">
        <div className="flex justify-between text-[15px]">
          <span className="text-muted">Items ({cart.itemCount})</span>
          <span className="font-semibold text-ink">{formatPeso(cart.itemsTotal)}</span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Delivery is {formatPeso(cart.deliveryFeePerStore)} per store. Pickup is free. You&apos;ll choose at checkout.
        </p>
      </div>

      <div className="sticky bottom-20 mt-5">
        {cart.hasProblems ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
            Fix the items marked in red to check out.
          </p>
        ) : (
          <ButtonLink href="/resident/checkout" className="w-full shadow-lg">
            Checkout · {formatPeso(cart.itemsTotal)}
          </ButtonLink>
        )}
      </div>
    </>
  );
}
