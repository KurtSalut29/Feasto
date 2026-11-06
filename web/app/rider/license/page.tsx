import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { RenewalPanel } from "@/components/app/renewal-panel";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { RenewalInfo } from "@/lib/verification-fields";

export const metadata: Metadata = { title: "Driver's license" };

export default function RiderLicensePage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderLicense />
    </Suspense>
  );
}

async function RiderLicense() {
  await requireRole("RIDER");
  const data = await serverApi<RenewalInfo>("/documents/renewal");
  return (
    <>
      <MobileHeading title="Driver's license" subtitle="Keep it valid so you can keep taking jobs." />
      <RenewalPanel data={data} />
    </>
  );
}
