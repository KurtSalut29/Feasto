import { BarChart3, Bike, Clock, Flame, ReceiptText, ShoppingBag, Store, Wallet, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { ReportDownload } from "@/components/app/report-download";
import { ReportPaper, reportNumber } from "@/components/app/report-paper";
import { SalesChart } from "@/components/app/sales-chart";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { percentChange, StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso, formatRange } from "@/lib/format";
import { periodFromParams, previousPeriod } from "@/lib/report-period";
import { serverApi } from "@/lib/server-api";
import type { SalesDay } from "@/lib/types";
import { PeriodPicker } from "./period-picker";

export const metadata: Metadata = { title: "Reports" };

type StoreReport = {
  store: { id: string; name: string; address: string };
  from: string;
  to: string;
  days: number;
  totals: { orders: number; sales: number; deliveryFees: number; itemsSold: number; averageOrder: number; cancelled: number; declined: number; busiestHour: number | null };
  daily: SalesDay[];
  dishes: { name: string; quantity: number; sales: number }[];
  payments: { method: string; orders: number; sales: number }[];
  fulfillment: { type: "Delivery" | "Pickup"; orders: number; sales: number }[];
};

export default function VendorReportsPage({ searchParams }: PageProps<"/vendor/reports">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

/** "12 PM – 1 PM" */
const hourLabel = (hour: number) => {
  const name = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;
  return `${name(hour)} – ${name(hour + 1)}`;
};

/** Days for up to two months; whole months after that (the same as the downloaded file) */
function chartDays(daily: SalesDay[]): SalesDay[] {
  if (daily.length <= 62) return daily;
  const months = new Map<string, SalesDay>();
  for (const d of daily) {
    const key = d.date.slice(0, 7);
    const m = months.get(key) ?? { date: key, orders: 0, sales: 0 };
    m.orders += d.orders;
    m.sales += d.sales;
    months.set(key, m);
  }
  return [...months.values()];
}

async function Reports({ searchParams }: Pick<PageProps<"/vendor/reports">, "searchParams">) {
  await requireRole("VENDOR");
  const period = periodFromParams(await searchParams);
  const before = previousPeriod(period);
  const query = (p: { from: string; to: string }) => `from=${p.from}&to=${p.to}`;
  const [{ report }, { report: previous }] = await Promise.all([
    serverApi<{ report: StoreReport }>(`/vendor/reports?${query(period)}`),
    serverApi<{ report: StoreReport }>(`/vendor/reports?${query(before)}`),
  ]);
  const { totals } = report;
  const vs = `vs ${formatRange(before.from, before.to)}`;
  const series = chartDays(report.daily);
  const exportPath = `/vendor/reports/export?${query(period)}`;
  const topDish = report.dishes[0]?.quantity ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Your store"
        title="Reports"
        description="Sales for any period you pick, ready to download as a Feasto report."
        actions={
          <>
            <PeriodPicker value={period} />
            <ReportDownload path={exportPath} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales" value={formatPeso(totals.sales)} change={percentChange(totals.sales, previous.totals.sales)} hint={vs} Icon={Wallet} accent="brand" />
        <StatCard label="Orders" value={totals.orders} change={percentChange(totals.orders, previous.totals.orders)} hint={vs} Icon={ReceiptText} accent="sky" />
        <StatCard
          label="Average order"
          value={totals.orders ? formatPeso(totals.averageOrder) : "—"}
          hint={`${totals.itemsSold.toLocaleString("en-PH")} items sold`}
          Icon={ShoppingBag}
          accent="violet"
        />
        <StatCard label="Not completed" value={totals.declined + totals.cancelled} hint={`${totals.declined} declined · ${totals.cancelled} cancelled`} Icon={XCircle} accent="gray" />
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card
            title={series === report.daily ? "Sales by day" : "Sales by month"}
            Icon={BarChart3}
            description={
              <span className="inline-flex flex-wrap items-center gap-x-2">
                {formatRange(report.from, report.to)}
                {totals.busiestHour !== null && (
                  <span className="inline-flex items-center gap-1">
                    · <Clock className="size-3.5" aria-hidden /> Busiest {hourLabel(totals.busiestHour)}
                  </span>
                )}
              </span>
            }
            actions={
              <div className="text-right">
                <p className="text-xl font-semibold text-ink tabular-nums">{formatPeso(totals.sales)}</p>
                <p className="text-xs text-muted">{totals.orders} orders</p>
              </div>
            }
          >
            <div className="px-5 pt-2 pb-5">
              {totals.orders === 0 ? (
                <EmptyState Icon={BarChart3} title="No sales in this period" text="Pick another period, or check back once residents order." />
              ) : (
                <SalesChart days={series} height={240} />
              )}
            </div>
          </Card>

          <Card title="Best sellers" Icon={Flame} description={report.dishes.length ? `${report.dishes.length} dishes sold · most ordered first` : "Nothing sold in this period"}>
            {report.dishes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Dishes show here once they sell.</p>
            ) : (
              <ol className="divide-y divide-line">
                {report.dishes.slice(0, 10).map((dish, i) => (
                  <li key={dish.name} className="flex items-center gap-3 px-5 py-3">
                    <span className={`w-6 shrink-0 text-sm font-bold tabular-nums ${i < 3 ? "text-brand-600" : "text-gray-400"}`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate font-medium text-ink">{dish.name}</p>
                        <p className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatPeso(dish.sales)}</p>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(dish.quantity / topDish) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-xs text-muted tabular-nums">{dish.quantity} sold</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {report.dishes.length > 10 && (
              <p className="border-t border-line bg-canvas/40 px-5 py-3 text-sm text-muted">The Excel download lists all {report.dishes.length} dishes and every order.</p>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Your Feasto report" description="What you download, as PDF, Word or Excel">
            <div className="bg-canvas/60 px-8 pt-6 pb-5">
              <ReportPaper
                number={reportNumber("S", report.from, report.to, report.store.id)}
                title={report.store.name}
                from={report.from}
                to={report.to}
                days={report.days}
                sales={totals.sales}
                orders={totals.orders}
              />
            </div>
            <div className="border-t border-line px-5 py-4">
              <ReportDownload path={exportPath} wide />
            </div>
          </Card>

          <Card title="How residents paid" Icon={Wallet}>
            <Breakdown rows={report.payments.map((p) => ({ name: p.method, orders: p.orders, sales: p.sales }))} total={totals.sales} />
          </Card>

          <Card title="Delivery and pickup" Icon={Bike}>
            <Split rows={report.fulfillment} total={totals.sales} />
          </Card>
        </aside>
      </div>
    </>
  );
}

function Breakdown({ rows, total }: { rows: { name: string; orders: number; sales: number }[]; total: number }) {
  if (rows.length === 0) return <p className="px-5 py-6 text-sm text-muted">Nothing paid in this period.</p>;
  return (
    <ul className="space-y-3.5 px-5 py-4">
      {rows.map((row) => {
        const share = total ? (row.sales / total) * 100 : 0;
        return (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{row.name}</span>
              <span className="font-semibold text-ink tabular-nums">{formatPeso(row.sales)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
              </div>
              <span className="w-24 text-right text-xs text-muted tabular-nums">
                {row.orders} {row.orders === 1 ? "order" : "orders"} · {share.toFixed(0)}%
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One bar split in two: delivery (orange) and pickup (dark), each named with its numbers */
function Split({ rows, total }: { rows: { type: "Delivery" | "Pickup"; orders: number; sales: number }[]; total: number }) {
  const [delivery, pickup] = rows;
  if (!total) return <p className="px-5 py-6 text-sm text-muted">No orders in this period.</p>;
  const part = (delivery.sales / total) * 100;
  return (
    <div className="px-5 py-4">
      <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {delivery.sales > 0 && <div className="rounded-l-full bg-brand-500 last:rounded-r-full" style={{ width: `${part}%` }} />}
        {pickup.sales > 0 && <div className="flex-1 rounded-r-full bg-ink first:rounded-l-full" />}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {[
          { row: delivery, Icon: Bike, dot: "bg-brand-500" },
          { row: pickup, Icon: Store, dot: "bg-ink" },
        ].map(({ row, Icon, dot }) => (
          <div key={row.type}>
            <dt className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className={`size-2 rounded-full ${dot}`} />
              <Icon className="size-3.5" aria-hidden />
              {row.type}
            </dt>
            <dd className="mt-0.5 font-semibold text-ink tabular-nums">{formatPeso(row.sales)}</dd>
            <dd className="text-xs text-muted">
              {row.orders} {row.orders === 1 ? "order" : "orders"} · {((row.sales / total) * 100).toFixed(0)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
