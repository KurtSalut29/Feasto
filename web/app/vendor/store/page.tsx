import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { ApprovalBadge } from "@/components/app/status-badges";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus } from "@/lib/types";
import { StoreForm, type StoreSettings } from "./store-form";

export const metadata: Metadata = { title: "Store" };

export default function VendorStorePage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorStore />
    </Suspense>
  );
}

async function VendorStore() {
  await requireRole("VENDOR");
  const { store } = await serverApi<{ store: StoreSettings & { status: ApprovalStatus } }>("/vendor/store");
  const { status, ...settings } = store;

  return (
    <>
      <PageHeader title="Store" description="How your store appears to residents." actions={<ApprovalBadge status={status} />} />
      <StoreForm
        initial={{
          name: settings.name,
          description: settings.description,
          address: settings.address,
          storeType: settings.storeType,
          acceptsReservations: settings.acceptsReservations,
          opensAt: settings.opensAt,
          closesAt: settings.closesAt,
          isTemporarilyClosed: settings.isTemporarilyClosed,
          imageUrl: settings.imageUrl,
        }}
      />
    </>
  );
}
