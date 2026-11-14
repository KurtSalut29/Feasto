import type { Metadata } from "next";
import { Suspense } from "react";
import { DisplaySettings } from "@/components/app/display-settings";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import type { DisplayPrefs } from "@/lib/display";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Display & accessibility" };

export default function DisplayPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Display />
    </Suspense>
  );
}

async function Display() {
  await requireRole("RESIDENT");
  const { display } = await serverApi<{ display: DisplayPrefs }>("/me/display");
  return (
    <>
      <MobileHeading title="Display & accessibility" subtitle="Make Feasto easier to see and use" />
      <DisplaySettings initial={display} />
    </>
  );
}
