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
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader eyebrow="Manage" title="Customers" description="Everyone who orders on Feasto: regulars, new customers and the ones who stopped. Give picked customers a Feasto voucher." />
      <CustomersView mode="feasto" />
    </>
  );
}
