import { ArrowRight, Bike, CircleCheck, ClipboardList, ReceiptText, ShieldCheck, Store, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { RatingBadge } from "@/components/app/rating";
import { SalesChart } from "@/components/app/sales-chart";
import { StoreCover } from "@/components/app/store-card";
import { Badge } from "@/components/ui/badge";
import { Card, CARD_LINK } from "@/components/ui/card";
import { percentChange, StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo, todayLabel } from "@/lib/format";
import { VEHICLE_LABEL } from "@/lib/labels";
import { orderCode, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import { STORE_TYPE_LABEL } from "@/lib/store-types";
import type { Fulfillment, OrderStatus, SalesDay, StoreSummary, StoreType, VehicleType } from "@/lib/types";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  pendingStores: number;
  pendingRiders: number;
  activeStores: number;
  activeRiders: number;
  ridersOnline: number;
  residents: number;
  ordersInProgress: number;
};
type PendingStore = { id: string; name: string; storeType: StoreType; createdAt: string };
type PendingRider = { id: string; vehicleType: VehicleType; createdAt: string; user: { name: string } };
type LiveOrder = {
  id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  subtotal: string;
  deliveryFee: string;
  createdAt: string;
  vendor: { name: string };
  checkout: { resident: { name: string } };
};

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminOverview />
    </Suspense>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const sum = (days: SalesDay[], key: "sales" | "orders") => days.reduce((n, d) => n + d[key], 0);

async function AdminOverview() {
  await requireRole("ADMIN");
  const [stats, { days }, { stores }, pendingStores, pendingRiders, live] = await Promise.all([
    serverApi<Overview>("/admin/overview"),
    serverApi<{ days: SalesDay[] }>("/admin/sales?days=14"),
    serverApi<{ stores: StoreSummary[] }>("/stores"),
    serverApi<{ items: PendingStore[] }>("/admin/approvals?kind=stores&status=PENDING"),
    serverApi<{ items: PendingRider[] }>("/admin/approvals?kind=riders&status=PENDING"),
    serverApi<{ orders: LiveOrder[] }>("/admin/orders?group=active"),
  ]);

  // This week against the week before, from the same 14 days the chart shows
  const thisWeek = days.slice(7);
  const lastWeek = days.slice(0, 7);
  const queue = [
    ...pendingStores.items.map((s) => ({ id: s.id, name: s.name, kind: "stores" as const, detail: STORE_TYPE_LABEL[s.storeType], createdAt: s.createdAt })),
    ...pendingRiders.items.map((r) => ({ id: r.id, name: r.user.name, kind: "riders" as const, detail: VEHICLE_LABEL[r.vehicleType], createdAt: r.createdAt })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const topStores = stores
    .filter((s) => s.rating !== null)
    .sort((a, b) => b.rating! - a.rating! || b.ratingCount - a.ratingCount)
    .slice(0, 5);

  return (
    <>
      <PageHeader eyebrow={todayLabel()} title="Overview" description="What's happening on Feasto right now." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Sales, last 7 days"
          value={formatPeso(sum(thisWeek, "sales"))}
          change={percentChange(sum(thisWeek, "sales"), sum(lastWeek, "sales"))}
          hint="vs the 7 days before"
          Icon={Wallet}
          accent="brand"
        />
        <StatCard
          label="Orders, last 7 days"
          value={sum(thisWeek, "orders")}
          change={percentChange(sum(thisWeek, "orders"), sum(lastWeek, "orders"))}
          hint="vs the 7 days before"
          Icon={ReceiptText}
          accent="sky"
        />
        <StatCard
          label="Live orders"
          value={stats.ordersInProgress}
          hint="Being prepared or on the way"
          Icon={ClipboardList}
          accent="violet"
          href="/admin/orders?group=active"
        />
        <StatCard
          label="Riders online"
          value={`${stats.ridersOnline} of ${stats.activeRiders}`}
          hint="Approved riders taking jobs now"
          Icon={Bike}
          accent="emerald"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="Sales across Feasto"
          description="Food sales from every store, last 14 days"
          className="xl:col-span-2"
          actions={
            <div className="text-right">
              <p className="text-xl font-semibold text-ink tabular-nums">{formatPeso(sum(days, "sales"))}</p>
              <p className="text-xs text-muted">{sum(days, "orders")} orders</p>
            </div>
          }
        >
          <div className="flex flex-1 flex-col justify-center px-5 pt-5 pb-4">
            <SalesChart days={days} height={232} />
          </div>
        </Card>

        <Card
          title="Waiting for approval"
          description={queue.length ? `${plural(stats.pendingStores, "store")} · ${plural(stats.pendingRiders, "rider")}` : undefined}
          Icon={ShieldCheck}
          footer={
            <Link href="/admin/approvals" className={CARD_LINK}>
              Open approvals <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          {queue.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CircleCheck className="size-6" aria-hidden />
              </span>
              <p className="mt-3 font-semibold text-ink">All caught up</p>
              <p className="text-sm text-muted">New stores and riders will appear here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {queue.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/admin/approvals?kind=${item.kind}&status=PENDING`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                  >
                    {item.kind === "stores" ? (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-black/5">
                        <Store className="size-4" aria-hidden />
                      </span>
                    ) : (
                      <Avatar name={item.name} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{item.name}</span>
                      <span className="block text-xs text-muted">
                        {item.kind === "stores" ? "Store" : "Rider"} · {item.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">{timeAgo(item.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <Card
          title="Live orders"
          description="Orders being prepared or delivered right now"
          className="xl:col-span-2"
          footer={
            <Link href="/admin/orders?group=active" className={CARD_LINK}>
              See all orders <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          {live.orders.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No orders in progress right now.</p>
          ) : (
            <ul className="divide-y divide-line">
              {live.orders.slice(0, 6).map((order) => (
                <li
                  key={order.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[84px_minmax(0,1fr)_96px_190px]"
                >
                  <p className="text-sm font-semibold text-ink">{orderCode(order.id)}</p>
                  <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                    <p className="truncate text-sm font-medium text-ink">{order.vendor.name}</p>
                    <p className="truncate text-xs text-muted">
                      {order.checkout.resident.name} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"} · {timeAgo(order.createdAt)}
                    </p>
                  </div>
                  <p className="hidden text-right text-sm font-semibold text-ink tabular-nums sm:block">
                    {formatPeso(Number(order.subtotal) + Number(order.deliveryFee))}
                  </p>
                  <div className="text-right sm:text-left">
                    <Badge tone={STATUS_TONE[order.status]} dot>
                      {statusLabel(order.status, order.fulfillment)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Community" description="Approved accounts on Feasto" Icon={Users}>
          <ul className="divide-y divide-line">
            {[
              { label: "Stores", value: stats.activeStores, pending: stats.pendingStores, Icon: Store, href: "/admin/users?role=VENDOR" },
              { label: "Riders", value: stats.activeRiders, pending: stats.pendingRiders, Icon: Bike, href: "/admin/users?role=RIDER" },
              { label: "Residents", value: stats.residents, pending: 0, Icon: Users, href: "/admin/users?role=RESIDENT" },
            ].map(({ label, value, pending, Icon, href }) => (
              <li key={label}>
                <Link href={href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-canvas/60">
                  <Icon className="size-[18px] text-muted" aria-hidden />
                  <span className="flex-1 text-sm font-medium text-ink">{label}</span>
                  {pending > 0 && <span className="text-xs font-medium text-amber-700">+{pending} pending</span>}
                  <span className="w-8 text-right text-lg font-semibold text-ink tabular-nums">{value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section className="mt-6" aria-labelledby="top-rated">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="top-rated" className="font-semibold text-ink">
              Top rated stores
            </h2>
            <p className="text-sm text-muted">By residents&apos; average rating</p>
          </div>
        </div>
        {topStores.length === 0 ? (
          <Card>
            <p className="px-5 py-8 text-center text-sm text-muted">No ratings yet.</p>
          </Card>
        ) : (
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {topStores.map((store, index) => (
              <li key={store.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="relative">
                  <StoreCover imageUrl={store.imageUrl} className="aspect-[16/9]" />
                  <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-white/95 text-xs font-bold text-ink shadow-sm">
                    {index + 1}
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="truncate text-sm font-semibold text-ink">{store.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted">{STORE_TYPE_LABEL[store.storeType]}</span>
                    <RatingBadge rating={store.rating} count={store.ratingCount} className="shrink-0 text-xs [&_svg]:size-3.5" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
