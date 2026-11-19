import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { SavedPayMethod } from "@/lib/types";
import { PayMethods } from "./pay-methods";

export const metadata: Metadata = { title: "Payment methods" };

export default function PaymentMethodsPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Methods />
    </Suspense>
  );
}

async function Methods() {
  const user = await requireRole("RESIDENT");
  const { methods } = await serverApi<{ methods: SavedPayMethod[] }>("/me/pay-methods");
  return (
    <>
      <MobileHeading title="Payment methods" subtitle="Your own GCash, Maya and cards, shown when you pay." />
      <PayMethods methods={methods} me={{ name: user.name, phone: user.phone }} />
    </>
  );
}
