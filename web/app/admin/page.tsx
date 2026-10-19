import { Bike, CircleCheck, ShieldCheck, Store, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  pendingStores: number;
  pendingRiders: number;
  activeStores: number;
  activeRiders: number;
  residents: number;
};

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminOverview />
    </Suspense>
  );
}

async function AdminOverview() {
  await requireRole("ADMIN");
  const stats = await serverApi<Overview>("/admin/overview");
  const pending = stats.pendingStores + stats.pendingRiders;

  return (
    <>
      <PageHeader title="Overview" description="What's happening on Feasto right now." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting for approval"
          value={pending}
          hint={`${stats.pendingStores} stores · ${stats.pendingRiders} riders`}
          Icon={ShieldCheck}
          highlight={pending > 0}
        />
        <StatCard label="Active stores" value={stats.activeStores} hint="Approved and visible to residents" Icon={Store} />
        <StatCard label="Active riders" value={stats.activeRiders} hint="Approved to take deliveries" Icon={Bike} />
        <StatCard label="Residents" value={stats.residents} hint="Registered customer accounts" Icon={Users} />
      </div>

      <Card title="Needs your attention" className="mt-6">
        {pending > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <div>
              <p className="font-medium text-ink">
                {pending} {pending === 1 ? "account is" : "accounts are"} waiting for review
              </p>
              <p className="text-sm text-muted">
                New stores and riders can&apos;t start until you approve them.
              </p>
            </div>
            <ButtonLink href="/admin/approvals">Review approvals</ButtonLink>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-5 py-5">
            <CircleCheck className="size-5 text-emerald-600" aria-hidden />
            <p className="text-ink">You&apos;re all caught up. No approvals waiting.</p>
          </div>
        )}
      </Card>
    </>
  );
}
