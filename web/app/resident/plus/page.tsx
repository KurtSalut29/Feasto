import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { PlusView } from "./plus-view";

export const metadata: Metadata = { title: "Feasto Plus" };

export default async function PlusPage({ searchParams }: { searchParams: Promise<{ payment?: string; result?: string }> }) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Plus searchParams={searchParams} />
    </Suspense>
  );
}

async function Plus({ searchParams }: { searchParams: Promise<{ payment?: string; result?: string }> }) {
  await requireRole("RESIDENT");
  const { payment, result } = await searchParams;
  return (
    <>
      <MobileHeading title="Feasto Plus" subtitle="A month of free deliveries and members-only vouchers." />
      <PlusView payment={payment ?? null} result={result ?? null} />
    </>
  );
}
