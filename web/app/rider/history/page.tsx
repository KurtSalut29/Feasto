import { ChevronRight, HandCoins, History, Star } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { PayFeastoButton } from "@/components/app/pay-feasto";
import { PayoutsCard } from "@/components/app/payouts-card";
import { SalesChart } from "@/components/app/sales-chart";
import { StoreCover } from "@/components/app/store-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDate, formatDay, formatPeso } from "@/lib/format";
import { orderCode, riderEarns } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { PaymentMethod, PayoutsData, SalesDay } from "@/lib/types";
import type { Totals } from "../rider-hero";

export const metadata: Metadata = { title: "History" };

type Delivery = {
  id: string;
  finishedAt: string;
  deliveryFee: string;
  /** Feasto's share of the fee */
  riderCut?: string;
  /** What the resident tipped, after it arrived */
  tip: string;
  subtotal: string;
  vendor: { name: string; imageUrl: string | null };
  items: { quantity: number }[];
  checkout: { deliveryAddress: string | null; paymentMethod: PaymentMethod };
  riderRating: { rating: number } | null;
};
type HistoryResponse = {
  deliveries: Delivery[];
  today: string;
  totals: Totals;
  rating: { average: number | null; count: number };
};

/** The rider's side of Feasto's share: what they still owe Feasto from fees collected in cash */
type RiderEarnings = {
  rate: number;
  balance: { owed: number; orders: number; lastSettledAt: string | null };
  settlements: { id: string; amount: string; method: string | null; createdAt: string }[];
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
/** A delivery's pay: its fee minus Feasto's share, plus any tip, all of which goes to the rider */
const pay = (d: Delivery) => riderEarns(d) + Number(d.tip ?? 0);
const sum = (list: Delivery[]) => list.reduce((n, d) => n + pay(d), 0);
const itemCount = (d: Delivery) => (d.items ?? []).reduce((n, i) => n + i.quantity, 0);

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
  const [{ deliveries, totals, today, rating }, earnings, payouts] = await Promise.all([
    serverApi<HistoryResponse>("/rider/history"),
    serverApi<RiderEarnings>("/rider/earnings"),
    serverApi<PayoutsData>("/rider/payouts"),
  ]);

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
          <p className="text-xs text-white">Earned today</p>
          <p className="text-[2rem] leading-tight font-bold tracking-tight tabular-nums">{formatPeso(totals.today.earnings)}</p>
          <p className="text-sm text-white/90">
            {plural(totals.today.count)}
            {totals.today.tips > 0 && ` · ${formatPeso(totals.today.tips)} in tips`}
          </p>
        </div>
        <dl className="relative mt-4 grid grid-cols-2 divide-x divide-white/25 rounded-2xl bg-white/15 py-2.5 ring-1 ring-white/25">
          <div className="flex flex-col-reverse px-3.5">
            <dt className="text-[0.6875rem] text-white">Last 7 days · {plural(weekCount)}</dt>
            <dd className="text-lg leading-tight font-bold tabular-nums">{formatPeso(weekEarned)}</dd>
          </div>
          <div className="flex flex-col-reverse px-3.5">
            <dt className="text-[0.6875rem] text-white">All time · {plural(totals.allTime.count)}</dt>
            <dd className="text-lg leading-tight font-bold tabular-nums">{formatPeso(totals.allTime.earnings)}</dd>
          </div>
        </dl>
      </section>

      <Link
        href="/rider/ratings"
        className="mb-5 flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
          <Star className="size-5 fill-amber-400 text-amber-400" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">
            {rating.average !== null ? `${rating.average.toFixed(1)} from ${rating.count} ${rating.count === 1 ? "rating" : "ratings"}` : "No ratings yet"}
          </span>
          <span className="block truncate text-[0.8125rem] text-muted">
            {totals.allTime.tips > 0 ? `${formatPeso(totals.allTime.tips)} in tips so far · See what residents said` : "See what residents say about your deliveries"}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-gray-500" aria-hidden />
      </Link>

      <BalanceCard earnings={earnings} feastoShare={totals.allTime.feastoShare ?? 0} />

      <div className="mb-5">
        <PayoutsCard who="rider" data={payouts} />
      </div>

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
              <h2 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">{group.label}</h2>
              <p className="text-xs text-muted">
                {plural(group.items.length)} · <span className="font-semibold text-emerald-700">{formatPeso(sum(group.items))}</span>
              </p>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {group.items.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <StoreCover imageUrl={d.vendor.imageUrl} className="size-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{d.vendor.name}</p>
                    <p className="truncate text-[0.8125rem] text-muted">
                      {formatClock(d.finishedAt)} · {orderCode(d.id)}
                    </p>
                    {d.subtotal !== undefined && (
                      <p className="truncate text-xs text-muted">
                        {itemCount(d)} {itemCount(d) === 1 ? "item" : "items"} · {formatPeso(Number(d.subtotal) + Number(d.deliveryFee))} order ·{" "}
                        {d.checkout.paymentMethod === "COD" ? "cash collected" : "paid online"}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-emerald-700 tabular-nums">+{formatPeso(pay(d))}</p>
                    {Number(d.riderCut) > 0 && (
                      <p className="text-[0.6875rem] text-muted tabular-nums">
                        {formatPeso(d.deliveryFee)} − {formatPeso(d.riderCut!)} Feasto
                      </p>
                    )}
                    {Number(d.tip) > 0 && <p className="text-[0.6875rem] font-medium text-emerald-700 tabular-nums">+ {formatPeso(d.tip)} tip</p>}
                    {d.riderRating && (
                      <p className="mt-0.5 inline-flex items-center gap-0.5 text-[0.6875rem] font-semibold text-ink">
                        <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                        {d.riderRating.rating}
                        <span className="sr-only"> stars from the resident</span>
                      </p>
                    )}
                  </div>
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

/** How a rider's pay reaches them, and what they still owe Feasto from cash, in a rider's words */
function BalanceCard({ earnings, feastoShare }: { earnings: RiderEarnings; feastoShare: number }) {
  const { balance, rate } = earnings;
  return (
    <section aria-label="Your pay and Feasto's share" className="mb-5 overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <HandCoins className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] text-muted">From cash deliveries, you owe Feasto</p>
          <p className={`text-lg leading-tight font-bold tabular-nums ${balance.owed > 0 ? "text-amber-800" : "text-ink"}`}>
            {balance.owed > 0 ? formatPeso(balance.owed) : "Nothing"}
          </p>
        </div>
      </div>
      {balance.owed > 0 && (
        <div className="px-4 pb-3">
          <PayFeastoButton owed={balance.owed} orders={balance.orders} who="rider" className="w-full" />
        </div>
      )}
      <dl className="space-y-2 border-t border-line bg-canvas/40 px-4 py-3 text-[0.8125rem]">
        <div>
          <dt className="font-semibold text-ink">Paid online</dt>
          <dd className="text-muted">Your part of the fee is sent to your GCash, Maya or bank as soon as you deliver. See it below.</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Paid in cash</dt>
          <dd className="text-muted">
            You keep the cash, so you pay Feasto its {rate}% of those fees: here in the app, or in person to the admin.
            {balance.orders > 0 &&
              ` ${balance.orders} cash ${balance.orders === 1 ? "delivery" : "deliveries"} ${balance.lastSettledAt ? `since you last paid, ${formatDate(balance.lastSettledAt)}` : "so far"}.`}
          </dd>
        </div>
      </dl>
      <p className="bg-canvas/40 px-4 pb-3 text-xs text-muted">Feasto&apos;s share of all your deliveries so far: {formatPeso(feastoShare)}.</p>
    </section>
  );
}
