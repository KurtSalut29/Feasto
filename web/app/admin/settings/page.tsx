import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSecurityCard } from "@/components/app/change-password-dialog";
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
  const user = await requireRole("ADMIN");
  const { settings } = await serverApi<{ settings: PlatformSettings }>("/admin/settings");
  return (
    <>
      <PageHeader eyebrow="Insights" title="Settings" description="Applied right away across every server. Each change is written in the activity log." />
      <div className="space-y-5">
        <AccountSecurityCard name={user.name} email={user.email} roleLabel="admin" />
        <SettingsForm initial={settings} />
      </div>
    </>
  );
}
