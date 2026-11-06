import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { SettingsForm, type PlatformSettings } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireRole("ADMIN");
  const { settings } = await serverApi<{ settings: PlatformSettings }>("/admin/settings");
  return (
    <>
      <PageHeader title="Settings" description="Applied right away across every server. Each change is written in the activity log." />
      <SettingsForm initial={settings} />
    </>
  );
}
