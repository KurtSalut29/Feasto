import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { VoucherList } from "./voucher-list";

export const metadata: Metadata = { title: "My vouchers" };

export default function VouchersPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Vouchers />
    </Suspense>
  );
}

async function Vouchers() {
  await requireRole("RESIDENT");
  return (
    <>
      <MobileHeading title="My vouchers" subtitle="Pick one at checkout, or type its code. One voucher and one delivery voucher per order." />
      <VoucherList />
    </>
  );
}
