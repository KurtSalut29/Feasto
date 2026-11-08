import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { Address } from "@/lib/types";
import { AddressManager } from "./address-manager";

export const metadata: Metadata = { title: "Delivery addresses" };

export default function AddressesPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Addresses />
    </Suspense>
  );
}

async function Addresses() {
  await requireRole("RESIDENT");
  const { addresses } = await serverApi<{ addresses: Address[] }>("/me/addresses");
  return (
    <>
      <MobileHeading title="Delivery addresses" subtitle="Where riders bring your orders." />
      <AddressManager addresses={addresses} />
    </>
  );
}
