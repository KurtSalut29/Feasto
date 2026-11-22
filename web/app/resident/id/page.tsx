import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { IdNotice } from "../id-notice";
import { PhilsysCheck } from "./philsys-check";

export const metadata: Metadata = { title: "Your ID" };

export default function IdPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Id />
    </Suspense>
  );
}

async function Id() {
  const user = await requireRole("RESIDENT");
  return (
    <>
      <MobileHeading title="Your ID" subtitle="Your valid ID keeps cash on delivery, Pabili and vouchers open to you." />
      <div className="space-y-4">
        <IdNotice user={user} />
        <PhilsysCheck />
      </div>
    </>
  );
}
