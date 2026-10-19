import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/dashboard/approval-notice";
import { DashboardShell, DashboardSkeleton, Greeting, UpcomingCard } from "@/components/dashboard/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { STORE_TYPE_LABEL } from "@/lib/store-types";

export const metadata: Metadata = { title: "Store" };

export default function VendorPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorDashboard />
    </Suspense>
  );
}

async function VendorDashboard() {
  const user = await requireRole("VENDOR");
  const store = user.vendor;

  return (
    <DashboardShell user={user}>
      <Greeting
        user={user}
        subtitle={store ? `Managing ${store.name} · ${STORE_TYPE_LABEL[store.storeType]}` : "Manage your store"}
      />

      {store && store.status !== "APPROVED" && (
        <div className="mt-6">
          <ApprovalNotice
            status={store.status}
            reviewNote={store.reviewNote}
            pendingText={`An admin will review ${store.name} soon. You can prepare your menu in the meantime; residents will see your store once it's approved.`}
            blockedText={`Residents can't see ${store.name} right now. Please contact the Feasto admin.`}
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <UpcomingCard title="Menu" text="Add dishes, prices, photos and stock." />
        <UpcomingCard title="Incoming orders" text="Accept orders and mark them ready for pickup." />
        <UpcomingCard title="Reservations" text="Set up your tables and see upcoming bookings." />
      </div>
    </DashboardShell>
  );
}
