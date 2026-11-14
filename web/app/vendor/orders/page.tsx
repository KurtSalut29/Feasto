import { ArrowDownWideNarrow, Bike, CalendarClock, ClipboardList, History, ListOrdered, MessageSquareText, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Arrival } from "@/components/app/arrival";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { PushCard } from "@/components/app/push-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatPeso, renderTime } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { itemsSummary, orderCode, statusLabel } from "@/lib/order-status";
import { clockOf, dayOf, sendAtOf } from "@/lib/schedule";
import { serverApi } from "@/lib/server-api";
import type { VendorOrder } from "@/lib/types";
import { HistoryTable } from "./history-table";
import { paymentLine } from "./order-parts";
import { OrderPanel } from "./order-panel";
import { isStageKey, ordinal, stageOf, STAGES, type StageKey } from "./queue";
import { WaitClock } from "./wait-clock";

export const metadata: Metadata = { title: "Orders" };

type Tab = "new" | "scheduled" | "preparing" | "ready" | "done";
type OrdersResponse = { orders: VendorOrder[]; counts: Record<Tab, number> };

export default function VendorOrdersPage({ searchParams }: PageProps<"/vendor/orders">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorOrders searchParams={searchParams} />
    </Suspense>
  );
}

async function VendorOrders({ searchParams }: Pick<PageProps<"/vendor/orders">, "searchParams">) {
  await requireRole("VENDOR");
  const params = await searchParams;
  const history = params.tab === "done";

  const views = (counts: Record<Tab, number>) => (
    <LinkTabs
      variant="segmented"
      label="View"
      tabs={[
        { href: "/vendor/orders", label: "Queue", Icon: ListOrdered, count: counts.new + counts.preparing + counts.ready, active: !history },
        { href: "/vendor/orders?tab=done", label: "History", Icon: History, count: counts.done, active: history },
      ]}
    />
  );

  if (history) {
    const data = await serverApi<OrdersResponse>("/vendor/orders?tab=done");
    return (
      <>
        <PageHeader eyebrow="Today" title="Orders" description="Delivered, collected, declined and cancelled orders." actions={views(data.counts)} />
        <HistoryTable orders={data.orders} />
      </>
    );
  }

  const [{ orders: queue, counts }, { orders: later }, { store }] = await Promise.all([
    serverApi<OrdersResponse>("/vendor/orders?tab=active"),
    serverApi<OrdersResponse>("/vendor/orders?tab=scheduled"),
    serverApi<{ store: { latitude: number | null; longitude: number | null } }>("/vendor/store"),
  ]);
  const storePin = pinOf(store.latitude, store.longitude);
  const stage = isStageKey(params.stage) ? params.stage : null;
  // The server sends the queue oldest first: first come, first served
  const shown = stage ? queue.filter((o) => stageOf(o.status)?.key === stage) : queue;
  const selected = shown.find((o) => o.id === params.order) ?? shown[0];
  const renderedAt = renderTime();

  const href = (next: { stage?: StageKey | null; order?: string }) => {
    const query = new URLSearchParams();
    const nextStage = next.stage === undefined ? stage : next.stage;
    if (nextStage) query.set("stage", nextStage);
    if (next.order) query.set("order", next.order);
    const text = query.toString();
    return text ? `/vendor/orders?${text}` : "/vendor/orders";
  };

  const tabs = [
    { key: null, label: "All orders", dot: "bg-ink", count: queue.length },
    ...STAGES.map((s) => ({ key: s.key, label: s.label, dot: s.dot, count: queue.filter((o) => stageOf(o.status)?.key === s.key).length })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Orders"
        description="First come, first served: the oldest order is always at the top of the queue."
        actions={views(counts)}
      />
      <PushCard place="orders" className="mb-4 max-w-2xl" />

      {/* Which stage to show, with how many orders are in each */}
      <nav aria-label="Stage" className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {tabs.map((tab) => {
            const active = stage === tab.key;
            return (
              <li key={tab.key ?? "all"}>
                <Link
                  href={href({ stage: tab.key })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-gray-300"
                  }`}
                >
                  <span aria-hidden className={`size-2 rounded-full ${active && tab.key === null ? "bg-white" : tab.dot}`} />
                  {tab.label}
                  <span
                    className={`min-w-6 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums ${
                      active ? "bg-white/20 text-white" : tab.key === "new" && tab.count > 0 ? "bg-amber-100 text-amber-800" : "bg-canvas text-muted"
                    }`}
                  >
                    {tab.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            Icon={ClipboardList}
            title="No orders right now"
            text="New orders appear here instantly, with a sound. The oldest one always stays at the top."
          />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,370px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,410px)_minmax(0,1fr)]">
          <section aria-labelledby="queue-title" className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-canvas/50 px-4 py-3">
              <h2 id="queue-title" className="text-sm font-semibold text-ink">
                {stage ? STAGES.find((s) => s.key === stage)!.label : "Queue"} · {shown.length} {shown.length === 1 ? "order" : "orders"}
              </h2>
              <p className="flex items-center gap-1 text-xs text-muted">
                <ArrowDownWideNarrow className="size-3.5" aria-hidden />
                Oldest first
              </p>
            </header>
            {shown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">Nothing in this stage right now.</p>
            ) : (
              <ol className="divide-y divide-line">
                {shown.map((order, i) => (
                  <li key={order.id}>
                    {/* A new order slides into the queue with a glow, so it's noticed */}
                    <Arrival list="vendor-queue" id={order.id}>
                      <QueueRow order={order} position={i + 1} on={order.id === selected?.id} href={href({ order: order.id })} renderedAt={renderedAt} />
                    </Arrival>
                    {/* Phones: the chosen order opens right under its row */}
                    {order.id === selected?.id && (
                      <div className="border-t border-brand-100 px-4 py-4 lg:hidden">
                        <OrderPanel order={order} store={storePin} position={i + 1} renderedAt={renderedAt} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Big screens: the chosen order beside the queue */}
          <div className="hidden rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:sticky lg:top-6 lg:block">
            {selected ? (
              <OrderPanel order={selected} store={storePin} position={shown.indexOf(selected) + 1} renderedAt={renderedAt} map />
            ) : (
              <p className="py-16 text-center text-sm text-muted">Choose an order from the queue.</p>
            )}
          </div>
        </div>
      )}

      {later.length > 0 && <ScheduledList orders={later} />}
    </>
  );
}

/**
 * Orders for later, soonest first. Nothing to do yet: each one joins the queue by itself, to accept,
 * a while before its time. Listed so the store can plan (and stock up) ahead.
 */
function ScheduledList({ orders }: { orders: VendorOrder[] }) {
  return (
    <section aria-labelledby="later-title" className="mt-6 overflow-hidden rounded-2xl border border-sky-100 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50/60 px-4 py-3">
        <h2 id="later-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarClock className="size-4 text-sky-600" aria-hidden />
          Scheduled for later · {orders.length}
        </h2>
        <p className="text-xs text-muted">Each one joins the queue by itself, to accept, before its time.</p>
      </header>
      <ul className="divide-y divide-line">
        {orders.map((order) => {
          const count = order.items.reduce((n, item) => n + item.quantity, 0);
          const delivery = order.fulfillment === "DELIVERY";
          const at = order.scheduledFor!;
          return (
            <li key={order.id}>
              <Link
                href={`/vendor/orders/${order.id}`}
                className="flex items-center gap-3 px-4 py-3 transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
              >
                <span className="w-20 shrink-0">
                  <span className="block text-xs font-semibold text-sky-700">{dayOf(at)}</span>
                  <span className="block font-bold text-ink tabular-nums">{clockOf(at)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {orderCode(order.id)} <span className="font-medium text-muted">· {order.checkout.resident.name.split(" ")[0]}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {count} {count === 1 ? "item" : "items"} · {itemsSummary(order.items)}
                  </span>
                </span>
                <span className="hidden shrink-0 text-right text-xs text-muted sm:block">
                  <span className="block font-semibold text-ink">{delivery ? "Delivery" : "Pickup"}</span>
                  Joins the queue {clockOf(sendAtOf(at, order.fulfillment))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One order in the queue, compact: its place in line, how long it has waited, and what it is. */
function QueueRow({ order, position, on, href, renderedAt }: { order: VendorOrder; position: number; on: boolean; href: string; renderedAt: number }) {
  const count = order.items.reduce((n, item) => n + item.quantity, 0);
  const payment = paymentLine(order);
  const step = stageOf(order.status);
  const delivery = order.fulfillment === "DELIVERY";
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={on ? "true" : undefined}
      className={`relative flex gap-3 px-4 py-3.5 transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
        on ? "bg-brand-50/70" : "hover:bg-canvas/60"
      }`}
    >
      {on && <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-r bg-brand-600" />}
      <span
        title={`${ordinal(position)} in line`}
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums ${
          position === 1 ? "bg-ink text-white" : "bg-canvas text-muted ring-1 ring-line"
        }`}
      >
        {position}
        <span className="sr-only"> in line</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-bold text-ink">
            {orderCode(order.id)} <span className="font-medium text-muted">· {order.checkout.resident.name.split(" ")[0]}</span>
          </span>
          <WaitClock since={order.placedAt ?? order.createdAt} status={order.status} renderedAt={renderedAt} />
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted">
          {count} {count === 1 ? "item" : "items"} · {itemsSummary(order.items)}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {step && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-ink ring-1 ring-line">
              <span aria-hidden className={`size-1.5 rounded-full ${step.dot}`} />
              {statusLabel(order.status, order.fulfillment)}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${delivery ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-700"}`}>
            {delivery ? <Bike className="size-3.5" aria-hidden /> : <Store className="size-3.5" aria-hidden />}
            {delivery ? "Delivery" : "Pickup"}
          </span>
          <span className={`rounded-md px-1.5 py-0.5 tabular-nums ${payment.tone === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
            {formatPeso(payment.total)} · {payment.tone === "paid" ? "Paid" : order.checkout.paymentMethod === "COD" ? "Cash" : "Unpaid"}
          </span>
          {order.scheduledFor && (
            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-sky-800 ring-1 ring-sky-100">
              <CalendarClock className="size-3.5" aria-hidden />
              For {clockOf(order.scheduledFor)}
            </span>
          )}
          {/* A note for the whole order or for a dish: either way the kitchen should read it first */}
          {(order.checkout.notes || order.items.some((i) => i.note)) && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">
              <MessageSquareText className="size-3.5" aria-hidden />
              {(() => {
                const dishNotes = order.items.filter((i) => i.note).length + (order.checkout.notes ? 1 : 0);
                return dishNotes > 1 ? `${dishNotes} notes` : "Note";
              })()}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
