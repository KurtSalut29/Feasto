import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { PaymentResult } from "./payment-result";

export const metadata: Metadata = { title: "Payment" };

/** Where Xendit's payment page sends the resident back to, paid or not. */
export default function PayingPage({ searchParams }: PageProps<"/resident/checkout/paying">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Paying searchParams={searchParams} />
    </Suspense>
  );
}

async function Paying({ searchParams }: Pick<PageProps<"/resident/checkout/paying">, "searchParams">) {
  await requireRole("RESIDENT");
  const params = await searchParams;
  const checkoutId = typeof params.checkout === "string" ? params.checkout : "";
  return (
    <>
      <MobileHeading title="Payment" />
      <PaymentResult checkoutId={checkoutId} backedOut={params.result === "failed"} />
    </>
  );
}
