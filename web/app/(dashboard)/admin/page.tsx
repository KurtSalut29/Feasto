import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, DashboardSkeleton, Greeting, UpcomingCard } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin" };

export default function AdminPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  const user = await requireRole("ADMIN");
  return (
    <DashboardShell user={user}>
      <Greeting user={user} subtitle="Here's what needs your attention on Feasto." />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <UpcomingCard title="Vendor approvals" text="Review new stores before residents can see them." />
        <UpcomingCard title="Users" text="See and manage residents, riders and vendors." />
        <UpcomingCard title="System health" text="Live status of the API copies, queue and workers." />
      </div>
    </DashboardShell>
  );
}
