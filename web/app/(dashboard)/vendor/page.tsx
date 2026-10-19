import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, DashboardSkeleton, Greeting, UpcomingCard } from "@/components/dashboard/dashboard-shell";
import { Alert } from "@/components/ui/alert";
import { requireRole } from "@/lib/auth";

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
      <Greeting user={user} subtitle={store ? `Managing ${store.name}` : "Manage your store"} />

      {store?.status === "PENDING" && (
        <div className="mt-6">
          <Alert tone="pending" title="Your store is waiting for approval">
            An admin will review {store.name} soon. You can prepare your menu in the meantime; residents will see your
            store once it&apos;s approved.
          </Alert>
        </div>
      )}
      {store?.status === "SUSPENDED" && (
        <div className="mt-6">
          <Alert tone="error" title="Your store is suspended">
            Residents can&apos;t see {store.name} right now. Please contact the Feasto admin.
          </Alert>
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
