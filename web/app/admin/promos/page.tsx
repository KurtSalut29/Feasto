import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { AdminPromos } from "./admin-promos";

export const metadata: Metadata = { title: "Promos" };

export default function PromosPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Promos />
    </Suspense>
  );
}

async function Promos() {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader eyebrow="Manage" title="Promos" description="Feasto's vouchers and the sale days, with what each has cost so far. Cancelled orders give their vouchers back, and the budget with them." />
      <AdminPromos />
    </>
  );
}
