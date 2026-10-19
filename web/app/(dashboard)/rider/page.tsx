import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/dashboard/approval-notice";
import { DashboardShell, DashboardSkeleton, Greeting, UpcomingCard } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/auth";
import type { VehicleType } from "@/lib/types";

export const metadata: Metadata = { title: "Deliveries" };

const VEHICLE_LABEL: Record<VehicleType, string> = {
  MOTORCYCLE: "Motorcycle",
  BICYCLE: "Bicycle",
  E_BIKE: "E-bike",
};

export default function RiderPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <RiderDashboard />
    </Suspense>
  );
}

async function RiderDashboard() {
  const user = await requireRole("RIDER");
  const profile = user.riderProfile;
  const vehicle = profile
    ? [VEHICLE_LABEL[profile.vehicleType], profile.plateNumber].filter(Boolean).join(" · ")
    : undefined;

  return (
    <DashboardShell user={user}>
      <Greeting
        user={user}
        subtitle={vehicle ? `Delivering by ${vehicle}` : "Ready to deliver? Your jobs will appear here."}
      />

      {profile && profile.status !== "APPROVED" && (
        <div className="mt-6">
          <ApprovalNotice
            status={profile.status}
            reviewNote={profile.reviewNote}
            pendingText="An admin is checking your vehicle details. You can go online and accept jobs once you're approved."
            blockedText="You can't go online or accept jobs right now. Please contact the Feasto admin."
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <UpcomingCard title="Available jobs" text="Orders that are ready for pickup near you." />
        <UpcomingCard title="Active delivery" text="Navigate to the customer and update the order status." />
        <UpcomingCard title="Earnings" text="Your completed deliveries and totals." />
      </div>
    </DashboardShell>
  );
}
