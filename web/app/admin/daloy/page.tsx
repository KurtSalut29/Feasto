import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { DaloyLive } from "./daloy-live";

export const metadata: Metadata = { title: "Daloy: live roads" };

export default function DaloyPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Daloy />
    </Suspense>
  );
}

async function Daloy() {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Daloy: live roads"
        description="Where the riders are, and how fast Naval's roads are moving now against the usual, measured from the riders' own rides. This first step only records: fees and ETAs don't use it yet."
      />
      <DaloyLive />
    </>
  );
}
