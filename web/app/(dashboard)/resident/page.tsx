import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, DashboardSkeleton, Greeting, UpcomingCard } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Home" };

export default function ResidentPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ResidentDashboard />
    </Suspense>
  );
}

async function ResidentDashboard() {
  const user = await requireRole("RESIDENT");
  return (
    <DashboardShell user={user}>
      <Greeting user={user} subtitle="What would you like to eat today?" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <UpcomingCard title="Browse vendors" text="See every store near you and their menus." />
        <UpcomingCard title="Order & track" text="Check out from several stores at once and follow your delivery." />
        <UpcomingCard title="Book a table" text="Reserve a table at your favorite place." />
      </div>
    </DashboardShell>
  );
}
