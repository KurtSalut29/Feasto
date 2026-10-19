import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      <Link href="/resident/account" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Account
      </Link>
      <MobileHeading title="Delivery addresses" subtitle="Where riders bring your orders." />
      <AddressManager addresses={addresses} />
    </>
  );
}
