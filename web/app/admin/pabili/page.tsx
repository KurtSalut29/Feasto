import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { PlacesManager, type AdminPlace, type Suggestion } from "./places-manager";

export const metadata: Metadata = { title: "Pabili places" };

export default function AdminPabiliPlacesPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Places />
    </Suspense>
  );
}

async function Places() {
  await requireRole("ADMIN");
  const data = await serverApi<{ places: AdminPlace[]; suggestions: Suggestion[]; suggestDays: number }>("/admin/pabili-places");
  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Pabili places"
        description="Shops that aren't on Feasto, like the market and drugstores. Pin each one once, so residents choose it instead of dropping a pin themselves."
      />
      <PlacesManager {...data} />
    </>
  );
}
