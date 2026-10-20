import { History, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { SalesChart } from "@/components/app/sales-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso } from "@/lib/format";
import { orderCode } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { SalesDay } from "@/lib/types";

export const metadata: Metadata = { title: "History" };

type HistoryResponse = {
  deliveries: { id: string; finishedAt: string; deliveryFee: string; vendor: { name: string }; checkout: { deliveryAddress: string | null } }[];
  totals: { today: { count: number; earnings: number }; allTime: { count: number; earnings: number } };
};

export default function RiderHistoryPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderHistory />
    </Suspense>
  );
}

/** Earnings per day for the last 7 days (Philippine dates), from the delivery list. */
function lastWeek(deliveries: HistoryResponse["deliveries"], today: string): SalesDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(new Date(`${today}T12:00:00Z`).getTime() - (6 - i) * 86400_000).toISOString().slice(0, 10);
    const onDay = deliveries.filter((d) => new Date(new Date(d.finishedAt).getTime() + 8 * 3600_000).toISOString().slice(0, 10) === date);
    return { date, orders: onDay.length, sales: onDay.reduce((n, d) => n + Number(d.deliveryFee), 0) };
  });
}

async function RiderHistory() {
  await requireRole("RIDER");
  const { deliveries, totals, today } = await serverApi<HistoryResponse & { today: string }>("/rider/history");

  return (
    <>
      <MobileHeading title="History" subtitle="Your completed deliveries and earnings." />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <Wallet className="size-4" aria-hidden /> Today
          </p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatPeso(totals.today.earnings)}</p>
          <p className="text-sm text-muted">
            {totals.today.count} {totals.today.count === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="text-sm font-medium text-muted">All time</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatPeso(totals.allTime.earnings)}</p>
          <p className="text-sm text-muted">
            {totals.allTime.count} {totals.allTime.count === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
      </div>
      {deliveries.length > 0 && (
        <section className="mb-5 rounded-2xl border border-line p-4">
          <h2 className="text-sm font-semibold text-ink">Earnings, last 7 days</h2>
          <div className="mt-4">
            <SalesChart days={lastWeek(deliveries, today)} valueLabel="Earnings" countLabel={["delivery", "deliveries"]} height={150} />
          </div>
        </section>
      )}
      {deliveries.length === 0 ? (
        <EmptyState Icon={History} title="No deliveries yet" text="Each delivery you complete is listed here, with what you earned." />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {deliveries.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{d.vendor.name}</p>
                <p className="truncate text-sm text-muted">
                  {orderCode(d.id)} · {formatDateTime(d.finishedAt)}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-emerald-700">+{formatPeso(d.deliveryFee)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
