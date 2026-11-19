import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { SavedPayMethod } from "@/lib/types";
import { TransferSteps } from "./transfer-steps";

export const metadata: Metadata = { title: "Send your payment" };

/** After choosing to send the money to Feasto's account: where to send it, and the receipt. */
type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function TransferPage({ searchParams }: Params) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Transfer searchParams={searchParams} />
    </Suspense>
  );
}

async function Transfer({ searchParams }: Params) {
  const user = await requireRole("RESIDENT");
  const params = await searchParams;
  const checkoutId = typeof params.checkout === "string" ? params.checkout : "";
  const { methods } = await serverApi<{ methods: SavedPayMethod[] }>("/me/pay-methods");
  return (
    <>
      <MobileHeading title="Send your payment" />
      <TransferSteps checkoutId={checkoutId} me={{ name: user.name, phone: user.phone }} saved={methods} />
    </>
  );
}
