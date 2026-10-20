import { Bike, CircleCheck, ShieldCheck, Store, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  DashboardSkeleton,
  PageHeader,
} from "@/components/app/dashboard-shell";
import { RatingBadge } from "@/components/app/rating";
import { SalesChart } from "@/components/app/sales-chart";
import { StoreCover } from "@/components/app/store-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { SalesDay, StoreSummary } from "@/lib/types";

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
  const [stats, { days }, { stores }] = await Promise.all([
    serverApi<Overview>("/admin/overview"),
    serverApi<{ days: SalesDay[] }>("/admin/sales?days=14"),
    serverApi<{ stores: StoreSummary[] }>("/stores"),
  ]);
  const pending = stats.pendingStores + stats.pendingRiders;
  const periodSales = days.reduce((n, d) => n + d.sales, 0);
  const periodOrders = days.reduce((n, d) => n + d.orders, 0);
  const topStores = stores
    .filter((s) => s.rating !== null)
    .sort((a, b) => b.rating! - a.rating! || b.ratingCount - a.ratingCount)
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title="Overview"
        description="What's happening on Feasto right now."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting for approval"
          value={pending}
          hint={`${stats.pendingStores} stores · ${stats.pendingRiders} riders`}
          Icon={ShieldCheck}
          highlight={pending > 0}
        />
        <StatCard
          label="Active stores"
          value={stats.activeStores}
          hint="Approved and visible to residents"
          Icon={Store}
        />
        <StatCard
          label="Active riders"
          value={stats.activeRiders}
          hint="Approved to take deliveries"
          Icon={Bike}
        />
        <StatCard
          label="Residents"
          value={stats.residents}
          hint="Registered customer accounts"
          Icon={Users}
        />
      </div>

      <Card
        title="Sales across Feasto, last 14 days"
        description="Food sales from every store per day. Hover a bar for details."
        className="mt-6"
        actions={
          <div className="text-right">
            <p className="text-xl font-semibold text-ink">
              {formatPeso(periodSales)}
            </p>
            <p className="text-xs text-muted">{periodOrders} orders</p>
          </div>
        }
      >
        <div className="px-5 pt-6 pb-4">
          <SalesChart days={days} height={240} />
        </div>
      </Card>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
        <Card title="Needs your attention">
          {pending > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
              <div>
                <p className="font-medium text-ink">
                  {pending} {pending === 1 ? "account is" : "accounts are"}{" "}
                  waiting for review
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
              <p className="text-ink">
                You&apos;re all caught up. No approvals waiting.
              </p>
            </div>
          )}
        </Card>

        <Card
          title="Top rated stores"
          description="By residents' average rating."
        >
          {topStores.length === 0 ? (
            <p className="px-5 py-5 text-sm text-muted">No ratings yet.</p>
          ) : (
            <ol className="divide-y divide-line">
              {topStores.map((store, index) => (
                <li
                  key={store.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <span className="w-4 text-sm font-semibold text-gray-400 tabular-nums">
                    {index + 1}
                  </span>
                  <StoreCover
                    imageUrl={store.imageUrl}
                    className="size-10 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">
                      {store.name}
                    </p>
                    <p className="text-xs text-muted">
                      {STORE_TYPE_LABEL[store.storeType]}
                    </p>
                  </div>
                  <RatingBadge
                    rating={store.rating}
                    count={store.ratingCount}
                  />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
