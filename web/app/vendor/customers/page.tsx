import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomersView } from "@/components/app/customers-view";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Customers />
    </Suspense>
  );
}

async function Customers() {
  await requireRole("VENDOR");
  return (
    <>
      <PageHeader eyebrow="Your store" title="Customers" description="Who orders from your store, how often and how much. Thank your regulars or win back the ones who stopped, with a voucher only they get." />
      <CustomersView mode="store" />
    </>
  );
}
