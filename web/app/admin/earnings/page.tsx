import { BadgePercent, Bike, CalendarHeart, HandCoins, History, Percent, Scale, Store, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { SalesChart } from "@/components/app/sales-chart";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { percentChange, StatCard } from "@/components/ui/stat-card";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime, formatPeso, formatRange } from "@/lib/format";
import { periodFromParams, previousPeriod } from "@/lib/report-period";
import { ONLINE_LABEL } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { PayoutsData, SalesDay } from "@/lib/types";
import { PeriodPicker } from "../../vendor/reports/period-picker";
import { PayoutsPanel } from "./payouts-panel";
import { SettleButton, type OpenBalance } from "./settle-button";

export const metadata: Metadata = { title: "Earnings" };

type Settlement = {
  id: string;
  amount: string;
  orders: number;
  /** The e-wallet or card when they paid in the app; null when handed to the admin */
  method: string | null;
  settledByName: string;
  createdAt: string;
  vendor: { name: string } | null;
  rider: { name: string } | null;
};

type Earnings = {
  from: string;
  to: string;
  rates: { commissionPercent: number; pickupCommissionPercent: number; riderFeePercent: number; freeTrialDays: number };
  totals: { earned: number; commission: number; riderShare: number; orders: number; sales: number; deliveryFees: number; takeRate: number };
  daily: SalesDay[];
  stores: { id: string; name: string; orders: number; sales: number; commission: number }[];
  riders: { id: string; name: string; deliveries: number; fees: number; riderShare: number; tips: number }[];
  balances: { stores: OpenBalance[]; riders: OpenBalance[] };
  /** Online orders, split when they were delivered: what went to the stores and the riders (with tips) */
  paidOut: { stores: number; riders: number; orders: number };
  settlements: Settlement[];
  freeTrials: { id: string; name: string; commissionFreeUntil: string }[];
};

export default function AdminEarningsPage({ searchParams }: PageProps<"/admin/earnings">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <EarningsPage searchParams={searchParams} />
    </Suspense>
  );
}

const SHOWN = 8;

async function EarningsPage({ searchParams }: Pick<PageProps<"/admin/earnings">, "searchParams">) {
  await requireRole("ADMIN");
  const period = periodFromParams(await searchParams, 30);
  const before = previousPeriod(period);
  const query = (p: { from: string; to: string }) => `from=${p.from}&to=${p.to}`;
  const [data, previous, payouts] = await Promise.all([
    serverApi<Earnings>(`/admin/earnings?${query(period)}`),
    serverApi<Earnings>(`/admin/earnings?${query(before)}`),
    serverApi<PayoutsData>("/admin/payouts"),
  ]);
  const { totals, rates } = data;
  const vs = `vs ${formatRange(before.from, before.to)}`;
  const owedToFeasto = [...data.balances.stores, ...data.balances.riders].reduce((n, b) => n + b.owed, 0);

  return (
    <>
      <PageHeader
        eyebrow="Insights"
        title="Earnings"
        description="What Feasto keeps from finished orders, and the cash still to collect from stores and riders."
        actions={<PeriodPicker value={period} path="/admin/earnings" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Feasto earned" value={formatPeso(totals.earned)} change={percentChange(totals.earned, previous.totals.earned)} hint={vs} Icon={Wallet} accent="brand" />
        <StatCard
          label="From store commissions"
          value={formatPeso(totals.commission)}
          hint={`${rates.commissionPercent}% on delivery · ${rates.pickupCommissionPercent}% on pickup`}
          Icon={Store}
          accent="sky"
        />
        <StatCard label="From delivery fees" value={formatPeso(totals.riderShare)} hint={`${rates.riderFeePercent}% of each fee · tips untouched`} Icon={Bike} accent="violet" />
        <StatCard
          label="Take rate"
          value={`${totals.takeRate.toFixed(1)}%`}
          hint={`of ${formatPeso(totals.sales + totals.deliveryFees)} in ${totals.orders.toLocaleString("en-PH")} finished orders`}
          Icon={Percent}
          accent="gray"
        />
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card
            title="Earned by day"
            Icon={BadgePercent}
            description={`${formatRange(data.from, data.to)} · delivered and collected orders only`}
            actions={
              <div className="text-right">
                <p className="text-xl font-semibold text-ink tabular-nums">{formatPeso(totals.earned)}</p>
                <p className="text-xs text-muted">{totals.orders.toLocaleString("en-PH")} orders</p>
              </div>
            }
          >
            <div className="px-5 pt-2 pb-5">
              {totals.orders === 0 ? (
                <EmptyState Icon={BadgePercent} title="Nothing earned in this period" text="Feasto earns once an order is delivered or collected." />
              ) : (
                <SalesChart days={data.daily} valueLabel="Earned" height={220} />
              )}
            </div>
          </Card>

          <Card title="By store" Icon={Store} description={`Commission from ${data.stores.length} ${data.stores.length === 1 ? "store" : "stores"}, the most first`}>
            {data.stores.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No finished orders in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Store</th>
                      <th className={`${TH} text-right`}>Orders</th>
                      <th className={`${TH} text-right`}>Food sales</th>
                      <th className={`${TH} text-right`}>Commission</th>
                      <th className={`${TH} text-right`}>Store kept</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {data.stores.slice(0, SHOWN).map((s) => (
                      <tr key={s.id} className={TR}>
                        <td className={`${TD} font-medium text-ink`}>{s.name}</td>
                        <td className={`${TD} text-right tabular-nums`}>{s.orders.toLocaleString("en-PH")}</td>
                        <td className={`${TD} text-right tabular-nums`}>{formatPeso(s.sales)}</td>
                        <td className={`${TD} text-right font-semibold text-ink tabular-nums`}>{s.commission ? formatPeso(s.commission) : "Free"}</td>
                        <td className={`${TD} text-right text-muted tabular-nums`}>{formatPeso(s.sales - s.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.stores.length > SHOWN && <p className="border-t border-line bg-canvas/40 px-5 py-3 text-sm text-muted">Top {SHOWN} of {data.stores.length} stores.</p>}
          </Card>

          <Card title="By rider" Icon={Bike} description="Feasto's share of the delivery fees. Tips are all the rider's.">
            {data.riders.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No deliveries in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={TABLE}>
                  <thead className={THEAD}>
                    <tr>
                      <th className={TH}>Rider</th>
                      <th className={`${TH} text-right`}>Deliveries</th>
                      <th className={`${TH} text-right`}>Fees</th>
                      <th className={`${TH} text-right`}>Feasto&apos;s share</th>
                      <th className={`${TH} text-right`}>Rider kept</th>
                    </tr>
                  </thead>
                  <tbody className={TBODY}>
                    {data.riders.slice(0, SHOWN).map((r) => (
                      <tr key={r.id} className={TR}>
                        <td className={`${TD} font-medium text-ink`}>{r.name}</td>
                        <td className={`${TD} text-right tabular-nums`}>{r.deliveries.toLocaleString("en-PH")}</td>
                        <td className={`${TD} text-right tabular-nums`}>{formatPeso(r.fees)}</td>
                        <td className={`${TD} text-right font-semibold text-ink tabular-nums`}>{formatPeso(r.riderShare)}</td>
                        <td className={`${TD} text-right text-muted tabular-nums`}>
                          {formatPeso(r.fees - r.riderShare + r.tips)}
                          {r.tips > 0 && <span className="block text-[11px]">incl. {formatPeso(r.tips)} tips</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.riders.length > SHOWN && <p className="border-t border-line bg-canvas/40 px-5 py-3 text-sm text-muted">Top {SHOWN} of {data.riders.length} riders.</p>}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Where the money went" Icon={Scale} description={`${formatRange(data.from, data.to)}`}>
            <dl className="divide-y divide-line text-sm">
              <div className="px-5 py-3">
                <dt className="font-medium text-ink">Online orders · split automatically</dt>
                <dd className="mt-0.5 text-muted">
                  When each of the {data.paidOut.orders.toLocaleString("en-PH")} online orders was delivered,{" "}
                  <span className="font-semibold text-ink tabular-nums">{formatPeso(data.paidOut.stores)}</span> was the stores&apos; share and{" "}
                  <span className="font-semibold text-ink tabular-nums">{formatPeso(data.paidOut.riders)}</span> the riders&apos; (tips included); Feasto kept the rest. Each transfer is under Payouts.
                </dd>
              </div>
              <div className="px-5 py-3">
                <dt className="font-medium text-ink">Cash orders · paid back by the store and rider</dt>
                <dd className="mt-0.5 text-muted">They keep the cash, so they pay Feasto its share in the app. What&apos;s still owed is below.</dd>
              </div>
            </dl>
          </Card>

          <PayoutsPanel data={payouts} />

          <Card
            title="Still owed from cash"
            Icon={HandCoins}
            description="Stores and riders pay this in the app with GCash, Maya or a card, and it clears by itself. Use Collect only when someone hands you the cash."
          >
            <div className="border-b border-line px-5 py-3">
              <p className="text-xs text-muted">Owed to Feasto</p>
              <p className="text-lg font-semibold text-ink tabular-nums">{formatPeso(owedToFeasto)}</p>
            </div>
            <BalanceList title="Stores" kind="store" list={data.balances.stores} />
            <BalanceList title="Riders" kind="rider" list={data.balances.riders} />
          </Card>

          {data.freeTrials.length > 0 && (
            <Card title="Free first month" Icon={CalendarHeart} description={`New stores pay no commission for ${rates.freeTrialDays} days after approval.`}>
              <ul className="divide-y divide-line">
                {data.freeTrials.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="truncate font-medium text-ink">{s.name}</span>
                    <span className="shrink-0 text-muted">until {formatDate(s.commissionFreeUntil)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Recent payments" Icon={History}>
            {data.settlements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Payments from stores and riders show here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.settlements.map((s) => {
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{s.vendor?.name ?? s.rider?.name}</p>
                        <p className="text-xs text-muted">
                          {formatDateTime(s.createdAt)} · {s.orders} {s.orders === 1 ? "order" : "orders"}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-xs text-muted">
                        <span className="block text-sm font-semibold text-ink tabular-nums">{formatPeso(s.amount)}</span>
                        {s.method ? `paid with ${ONLINE_LABEL[s.method as keyof typeof ONLINE_LABEL]}` : "in person"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

/** How many balances show before "Show all": the biggest amounts come first */
const FIRST = 5;

function BalanceRow({ b, kind }: { b: OpenBalance; kind: "store" | "rider" }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{b.name}</p>
        <p className="text-sm font-semibold text-amber-800 tabular-nums">Owes Feasto {formatPeso(b.owed)}</p>
        <p className="text-xs text-muted">
          {b.orders} cash {b.orders === 1 ? "order" : "orders"} · {b.lastSettledAt ? `last collected ${formatDate(b.lastSettledAt)}` : "never collected"}
        </p>
      </div>
      <SettleButton party={b} kind={kind} />
    </li>
  );
}

function BalanceList({ title, kind, list }: { title: string; kind: "store" | "rider"; list: OpenBalance[] }) {
  const rest = list.slice(FIRST);
  return (
    <section aria-label={title}>
      <h3 className="bg-canvas/60 px-5 py-2 text-[11px] font-semibold tracking-wider text-gray-500 uppercase">
        {title} · {list.length}
      </h3>
      {list.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nothing to collect.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {list.slice(0, FIRST).map((b) => (
              <BalanceRow key={b.id} b={b} kind={kind} />
            ))}
          </ul>
          {rest.length > 0 && (
            <details className="group border-t border-line">
              <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show all {list.length} {title.toLowerCase()}</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {rest.map((b) => (
                  <BalanceRow key={b.id} b={b} kind={kind} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
