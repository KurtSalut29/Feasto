import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { DisplaySettings } from "@/components/app/display-settings";
import { requireRole } from "@/lib/auth";
import type { DisplayPrefs } from "@/lib/display";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Display & accessibility" };

export default function DisplayPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Display />
    </Suspense>
  );
}

async function Display() {
  await requireRole("VENDOR");
  const { display } = await serverApi<{ display: DisplayPrefs }>("/me/display");
  return (
    <>
      <PageHeader eyebrow="You" title="Display & accessibility" description="Make Feasto easier to see and use. Saved to your account, for every device." />
      <DisplaySettings initial={display} />
    </>
  );
}
