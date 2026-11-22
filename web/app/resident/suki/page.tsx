import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { SukiView } from "./suki-view";

export const metadata: Metadata = { title: "Suki points" };

export default function SukiPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Suki />
    </Suspense>
  );
}

async function Suki() {
  await requireRole("RESIDENT");
  return (
    <>
      <MobileHeading title="Suki points" subtitle="Points on every order, missions, friends and your birthday. Use them at checkout." />
      <SukiView />
    </>
  );
}
