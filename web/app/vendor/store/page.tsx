import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { RenewalPanel } from "@/components/app/renewal-panel";
import { ApprovalBadge } from "@/components/app/status-badges";
import { StoreStatusPill } from "@/components/app/store-status";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { ApprovalStatus } from "@/lib/types";
import type { RenewalInfo } from "@/lib/verification-fields";
import { StoreForm, type StoreSettings } from "./store-form";

export const metadata: Metadata = { title: "Store settings" };

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
  const permit = status === "APPROVED" || status === "SUSPENDED" ? await serverApi<RenewalInfo>("/documents/renewal") : null;

  return (
    <>
      <PageHeader
        eyebrow="Your store"
        title="Store settings"
        description="How your store appears to residents, when it is open, and how they can pay."
        actions={status === "APPROVED" ? <StoreStatusPill store={settings} /> : <ApprovalBadge status={status} />}
      />
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
          latitude: settings.latitude,
          longitude: settings.longitude,
          acceptsCash: settings.acceptsCash,
          onlinePayments: settings.onlinePayments,
        }}
        permit={permit ? <RenewalPanel data={permit} /> : undefined}
      />
    </>
  );
}
