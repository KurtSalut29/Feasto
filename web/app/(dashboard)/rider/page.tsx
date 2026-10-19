import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, DashboardSkeleton, Greeting, UpcomingCard } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Deliveries" };

export default function RiderPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <RiderDashboard />
    </Suspense>
  );
}

async function RiderDashboard() {
  const user = await requireRole("RIDER");
  return (
    <DashboardShell user={user}>
      <Greeting user={user} subtitle="Ready to deliver? Your jobs will appear here." />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <UpcomingCard title="Available jobs" text="Orders that are ready for pickup near you." />
        <UpcomingCard title="Active delivery" text="Navigate to the customer and update the order status." />
        <UpcomingCard title="Earnings" text="Your completed deliveries and totals." />
      </div>
    </DashboardShell>
  );
}
