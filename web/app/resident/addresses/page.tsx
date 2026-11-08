import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { Address } from "@/lib/types";
import { AddressManager } from "./address-manager";

export const metadata: Metadata = { title: "Delivery addresses" };

export default function AddressesPage({ searchParams }: PageProps<"/resident/addresses">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Addresses searchParams={searchParams} />
    </Suspense>
  );
}

async function Addresses({ searchParams }: Pick<PageProps<"/resident/addresses">, "searchParams">) {
  await requireRole("RESIDENT");
  // ?add=1 (from Home's address switcher) opens the new-address form right away
  const { add } = await searchParams;
  const { addresses } = await serverApi<{ addresses: Address[] }>("/me/addresses");
  return (
    <>
      <MobileHeading title="Delivery addresses" subtitle="Where riders bring your orders." />
      <AddressManager key={String(add)} addresses={addresses} startAdding={add === "1"} />
    </>
  );
}
