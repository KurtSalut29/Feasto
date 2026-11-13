import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { Address, Cart } from "@/lib/types";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Checkout />
    </Suspense>
  );
}

async function Checkout() {
  const user = await requireRole("RESIDENT");
  const [{ cart, payments }, { addresses }] = await Promise.all([
    serverApi<{ cart: Cart; payments: "simulated" | "xendit" }>("/cart"),
    serverApi<{ addresses: Address[] }>("/me/addresses"),
  ]);
  // Nothing to pay for, or something changed: back to the cart to fix it. A store that's only
  // closed right now is fine: the order can be scheduled for when it's open.
  if (cart.groups.length === 0 || (cart.hasProblems && !cart.canSchedule)) redirect("/resident/cart");

  return (
    <>
      <MobileHeading title="Checkout" />
      <CheckoutForm cart={cart} addresses={addresses} holder={user.name} phone={user.phone} realPayments={payments === "xendit"} />
    </>
  );
}
