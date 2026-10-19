import { BarChart3, Cpu, LoaderCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, formatPeso } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { GenerateReport } from "./generate-report";

export const metadata: Metadata = { title: "Reports" };

type ReportSummary = {
  id: string;
  status: "running" | "done";
  from: string;
  to: string;
  requestedAt: string;
  durationMs: number | null;
  total: number;
  done: number;
  workers: string[];
  totals: { orders: number; sales: number; deliveryFees: number; cancelled: number };
};
type Report = ReportSummary & {
  rows: { vendorId: string; name: string; orders: number; sales: number; deliveryFees: number; cancelled: number; topDish: string | null; computedBy: string }[];
};

export default function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

const range = (r: { from: string; to: string }) =>
  r.from === r.to ? formatDate(`${r.from}T12:00:00+08:00`) : `${formatDate(`${r.from}T12:00:00+08:00`)} – ${formatDate(`${r.to}T12:00:00+08:00`)}`;

async function Reports({ searchParams }: Pick<PageProps<"/admin/reports">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const { reports } = await serverApi<{ reports: ReportSummary[] }>("/admin/reports");
  const id = typeof params.id === "string" ? params.id : reports[0]?.id;
  const report = id ? (await serverApi<{ report: Report }>(`/admin/reports/${id}`)).report : null;

  return (
    <>
      <PageHeader title="Reports" description="Sales per store. Each store's numbers are computed in parallel by the workers." />
      <Card className="mb-6">
        <div className="px-5 py-4">
          <GenerateReport />
        </div>
      </Card>

      {!report ? (
        <Card>
          <EmptyState Icon={BarChart3} title="No reports yet" text="Pick a period and generate your first sales report." />
        </Card>
      ) : report.status === "running" ? (
        <Card>
          <AutoRefresh everyMs={1000} />
          <div className="flex items-center gap-4 px-5 py-8">
            <LoaderCircle className="size-6 animate-spin text-brand-600" aria-hidden />
            <div className="flex-1">
              <p className="font-semibold text-ink">Computing {range(report)}…</p>
              <p className="text-sm text-muted">
                {report.done} of {report.total || "?"} stores done
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${report.total ? (report.done / report.total) * 100 : 5}%` }} />
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Sales" value={formatPeso(report.totals.sales)} hint={range(report)} Icon={BarChart3} />
            <StatCard label="Orders" value={report.totals.orders} hint={`${report.totals.cancelled} cancelled or declined`} Icon={BarChart3} />
            <StatCard label="Delivery fees" value={formatPeso(report.totals.deliveryFees)} hint="Earned by riders" Icon={BarChart3} />
            <StatCard
              label="Computed in"
              value={`${((report.durationMs ?? 0) / 1000).toFixed(2)} s`}
              hint={`${report.total} store jobs on ${report.workers.join(" + ") || "the workers"}`}
              Icon={Cpu}
              highlight
            />
          </div>
          <Card title={`Sales by store · ${range(report)}`} className="mt-6">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Store</th>
                    <th className="px-5 py-3 text-right font-semibold">Orders</th>
                    <th className="px-5 py-3 text-right font-semibold">Sales</th>
                    <th className="px-5 py-3 text-right font-semibold">Avg. order</th>
                    <th className="px-5 py-3 font-semibold">Best seller</th>
                    <th className="px-5 py-3 font-semibold">Computed by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.rows.map((row) => (
                    <tr key={row.vendorId}>
                      <td className="px-5 py-3 font-medium text-ink">{row.name}</td>
                      <td className="px-5 py-3 text-right text-ink">{row.orders}</td>
                      <td className="px-5 py-3 text-right font-semibold text-ink">{formatPeso(row.sales)}</td>
                      <td className="px-5 py-3 text-right text-muted">{row.orders ? formatPeso(row.sales / row.orders) : "—"}</td>
                      <td className="px-5 py-3 text-muted">{row.topDish ?? "—"}</td>
                      <td className="px-5 py-3 text-xs text-gray-400">{row.computedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {reports.length > 1 && (
        <Card title="Recent reports" className="mt-6">
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/reports?id=${r.id}`}
                  aria-current={r.id === id ? "page" : undefined}
                  className={`flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-canvas ${r.id === id ? "bg-brand-50/60" : ""}`}
                >
                  <span className="font-medium text-ink">{range(r)}</span>
                  <span className="text-muted">
                    {formatPeso(r.totals.sales)} · requested {formatDateTime(r.requestedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
