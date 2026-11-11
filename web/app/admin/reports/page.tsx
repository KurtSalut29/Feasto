import { BarChart3, Bike, Cpu, History, LoaderCircle, ReceiptText, ShoppingBag, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/app/auto-refresh";
import { ReportDownload } from "@/components/app/report-download";
import { ReportPaper, reportNumber } from "@/components/app/report-paper";
import { ViewReportButton } from "@/components/app/report-viewer";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { dayCount, formatPeso, formatRange, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import { GenerateReport } from "./generate-report";
import { StoreSales, WorkerChip } from "./store-sales";

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

/** Feasto's way of writing a period: "Oct 1 – 11, 2026" */
const range = (r: { from: string; to: string }) => formatRange(r.from, r.to);

async function Reports({ searchParams }: Pick<PageProps<"/admin/reports">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const { reports } = await serverApi<{ reports: ReportSummary[] }>("/admin/reports");
  const id = typeof params.id === "string" ? params.id : reports[0]?.id;
  const report = id ? (await serverApi<{ report: Report }>(`/admin/reports/${id}`)).report : null;

  return (
    <>
      <PageHeader eyebrow="Insights" title="Reports" description="Sales per store, computed in parallel: each store is a separate job shared across the workers." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <BarChart3 className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold text-ink">New sales report</p>
              <p className="text-sm text-muted">Pick the dates and the report starts right away. It fills in as the workers finish.</p>
            </div>
          </div>
          <GenerateReport />
        </div>
      </Card>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {!report ? (
            <Card>
              <EmptyState Icon={BarChart3} title="No reports yet" text="Pick a period above and generate your first sales report." />
            </Card>
          ) : report.status === "running" ? (
            <Card>
              <AutoRefresh everyMs={1000} />
              <div className="flex items-center gap-4 px-5 py-10">
                <LoaderCircle className="size-7 animate-spin text-brand-600" aria-hidden />
                <div className="flex-1">
                  <p className="font-semibold text-ink">Computing {range(report)}…</p>
                  <p className="text-sm text-muted">
                    {report.done} of {report.total || "?"} store jobs done
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${report.total ? (report.done / report.total) * 100 : 5}%` }} />
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">{range(report)}</h2>
                  <p className="text-sm text-muted">
                    {dayCount(report.from, report.to)} {dayCount(report.from, report.to) === 1 ? "day" : "days"} · requested {timeAgo(report.requestedAt).toLowerCase()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ViewReportButton documentPath={`/admin/reports/${report.id}/document`} exportPath={`/admin/reports/${report.id}/export`} />
                  <ReportDownload path={`/admin/reports/${report.id}/export`} secondary />
                </div>
              </div>
              <div className="mb-4">
                <p className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-muted">
                  <Cpu className="size-4 text-brand-600" aria-hidden />
                  <span>
                    <span className="font-semibold text-ink">{report.total} store jobs</span> in{" "}
                    <span className="font-semibold text-ink">{((report.durationMs ?? 0) / 1000).toFixed(2)} s</span> on
                  </span>
                  {report.workers.map((w) => (
                    <WorkerChip key={w} name={w} workers={report.workers} />
                  ))}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Sales" value={formatPeso(report.totals.sales)} hint="Before delivery fees" Icon={Wallet} accent="brand" />
                <StatCard label="Orders" value={report.totals.orders} hint={`${report.totals.cancelled} cancelled or declined`} Icon={ReceiptText} accent="sky" />
                <StatCard
                  label="Average order"
                  value={report.totals.orders ? formatPeso(report.totals.sales / report.totals.orders) : "—"}
                  hint="Sales ÷ orders"
                  Icon={ShoppingBag}
                  accent="violet"
                />
                <StatCard label="Delivery fees" value={formatPeso(report.totals.deliveryFees)} hint="Earned by riders" Icon={Bike} accent="emerald" />
              </div>

              <Card
                title="Sales by store"
                description={`Highest sales first · ${report.rows.filter((r) => r.orders > 0).length} of ${report.rows.length} stores sold something`}
                className="mt-6"
              >
                <StoreSales rows={report.rows} totalSales={report.totals.sales} workers={report.workers} />
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
        {report?.status === "done" && (
          <Card title="Feasto report" description="Tap the page to view it full size">
            <div className="bg-canvas/60 px-8 pt-6 pb-5">
              <ViewReportButton documentPath={`/admin/reports/${report.id}/document`} exportPath={`/admin/reports/${report.id}/export`} label="View the Feasto report full size">
              <ReportPaper
                number={reportNumber("P", report.from, report.to, report.id.replaceAll("-", ""))}
                title="All Feasto stores"
                from={report.from}
                to={report.to}
                days={dayCount(report.from, report.to)}
                sales={report.totals.sales}
                orders={report.totals.orders}
              />
              </ViewReportButton>
            </div>
          </Card>
        )}
        <Card title="Report history" Icon={History}>
          {reports.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">Reports you generate are kept here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {reports.map((r) => {
                const active = r.id === id;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/admin/reports?id=${r.id}`}
                      aria-current={active ? "page" : undefined}
                      className={`block border-l-2 px-5 py-3 transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                        active ? "border-brand-600 bg-brand-50/50" : "border-transparent"
                      }`}
                    >
                      <span className="block text-sm font-medium text-ink">{range(r)}</span>
                      <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                        <span>{timeAgo(r.requestedAt)}</span>
                        <span className="font-semibold text-ink tabular-nums">{r.status === "running" ? "Computing…" : formatPeso(r.totals.sales)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        </div>
      </div>
    </>
  );
}
