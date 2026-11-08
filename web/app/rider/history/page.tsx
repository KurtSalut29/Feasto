import { History, Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { SalesChart } from "@/components/app/sales-chart";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDay, formatPeso } from "@/lib/format";
import { orderCode } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { SalesDay } from "@/lib/types";

export const metadata: Metadata = { title: "History" };

type Delivery = { id: string; finishedAt: string; deliveryFee: string; vendor: { name: string }; checkout: { deliveryAddress: string | null } };
type HistoryResponse = {
  deliveries: Delivery[];
  today: string;
  totals: { today: { count: number; earnings: number }; allTime: { count: number; earnings: number } };
};

/** The server sends a rider's latest deliveries, up to this many */
const LIST_LIMIT = 50;

export default function RiderHistoryPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderHistory />
    </Suspense>
  );
}

/** "YYYY-MM-DD" of a moment, in Manila */
const manilaDay = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
const dayBefore = (day: string, n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() - n * 86400_000).toISOString().slice(0, 10);
const plural = (n: number) => `${n} ${n === 1 ? "delivery" : "deliveries"}`;
const sum = (list: Delivery[]) => list.reduce((n, d) => n + Number(d.deliveryFee), 0);

/** Earnings per day for the last 7 days (Philippine dates), from the delivery list. */
function lastWeek(deliveries: Delivery[], today: string): SalesDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = dayBefore(today, 6 - i);
    const onDay = deliveries.filter((d) => manilaDay(d.finishedAt) === date);
    return { date, orders: onDay.length, sales: sum(onDay) };
  });
}

/** Deliveries by day, newest first: Today, Yesterday, then dates. */
function byDay(deliveries: Delivery[], today: string) {
  const groups = new Map<string, Delivery[]>();
  for (const d of deliveries) {
    const day = manilaDay(d.finishedAt);
    groups.set(day, [...(groups.get(day) ?? []), d]);
  }
  return [...groups].map(([day, items]) => ({
    label: day === today ? "Today" : day === dayBefore(today, 1) ? "Yesterday" : formatDay(items[0].finishedAt),
    items,
  }));
}

/**
 * What a rider has earned: today and this week up top, a week's bars, then each delivery
 * grouped by day with the day's total, the way riders count their pay.
 */
async function RiderHistory() {
  await requireRole("RIDER");
  const { deliveries, totals, today } = await serverApi<HistoryResponse>("/rider/history");

  if (deliveries.length === 0) {
    return (
      <>
        <MobileHeading title="History" subtitle="Your completed deliveries and earnings." />
        <EmptyState
          Icon={History}
          title="No deliveries yet"
          text="Each delivery you finish is listed here, with what you earned."
          action={<ButtonLink href="/rider">See jobs</ButtonLink>}
        />
      </>
    );
  }

  const week = lastWeek(deliveries, today);
  const weekEarned = week.reduce((n, d) => n + d.sales, 0);
  const weekCount = week.reduce((n, d) => n + d.orders, 0);

  return (
    <>
      <MobileHeading title="History" subtitle="Your completed deliveries and earnings." />

      <section aria-label="Earnings" className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-[0_14px_30px_-16px_rgba(178,58,0,0.8)]">
        <span aria-hidden className="absolute -top-14 -right-12 size-44 rounded-full bg-brand-500/60" />
        <div className="relative">
          <p className="text-xs text-white/80">Earned today</p>
          <p className="text-[32px] leading-tight font-bold tracking-tight tabular-nums">{formatPeso(totals.today.earnings)}</p>
          <p className="text-sm text-white/90">{plural(totals.today.count)}</p>
        </div>
        <dl className="relative mt-4 grid grid-cols-2 divide-x divide-white/25 rounded-2xl bg-white/15 py-2.5 ring-1 ring-white/25">
          <div className="flex flex-col-reverse px-3.5">
            <dt className="text-[11px] text-white/80">Last 7 days · {plural(weekCount)}</dt>
            <dd className="text-lg leading-tight font-bold tabular-nums">{formatPeso(weekEarned)}</dd>
          </div>
          <div className="flex flex-col-reverse px-3.5">
            <dt className="text-[11px] text-white/80">All time · {plural(totals.allTime.count)}</dt>
            <dd className="text-lg leading-tight font-bold tabular-nums">{formatPeso(totals.allTime.earnings)}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-2xl border border-line p-4">
        <h2 className="text-sm font-semibold text-ink">Earnings, last 7 days</h2>
        <div className="mt-4">
          <SalesChart days={week} valueLabel="Earnings" countLabel={["delivery", "deliveries"]} height={150} />
        </div>
      </section>

      <div className="space-y-5">
        {byDay(deliveries, today).map((group) => (
          <section key={group.label} aria-label={group.label}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">{group.label}</h2>
              <p className="text-xs text-muted">
                {plural(group.items.length)} · <span className="font-semibold text-emerald-700">{formatPeso(sum(group.items))}</span>
              </p>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {group.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600" aria-hidden>
                    <Store className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{d.vendor.name}</p>
                    <p className="truncate text-[13px] text-muted">
                      {formatClock(d.finishedAt)} · {orderCode(d.id)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-emerald-700 tabular-nums">+{formatPeso(d.deliveryFee)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {deliveries.length >= LIST_LIMIT && <p className="mt-4 text-center text-xs text-muted">Showing your latest {LIST_LIMIT} deliveries.</p>}
    </>
  );
}
