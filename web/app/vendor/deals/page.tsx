import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { StoreDeals } from "./store-deals";

export const metadata: Metadata = { title: "Deals" };

export default function DealsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Deals />
    </Suspense>
  );
}

async function Deals() {
  await requireRole("VENDOR");
  return (
    <>
      <PageHeader eyebrow="Your store" title="Deals and vouchers" description="Lower prices on some dishes (all day, or a happy hour), and vouchers residents type at checkout. You pay for them; Feasto's commission is on what's left." />
      <StoreDeals />
    </>
  );
}
