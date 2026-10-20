import { Bike, ClipboardList, History, LayoutGrid, MapPin, MessageSquareText, Phone, Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso, timeAgo } from "@/lib/format";
import { orderCode, PAYMENT_LABEL, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { VendorOrder } from "@/lib/types";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Orders" };

type Tab = "new" | "preparing" | "ready" | "done";
type OrdersResponse = { orders: VendorOrder[]; counts: Record<Tab, number> };

/** The three live columns of the kitchen board, left to right. */
const COLUMNS = [
  { key: "new", title: "New", dot: "bg-amber-500", empty: "New orders pop up here instantly, with a sound." },
  { key: "preparing", title: "In the kitchen", dot: "bg-brand-500", empty: "Orders you accepted and are cooking." },
  { key: "ready", title: "Ready", dot: "bg-emerald-500", empty: "Waiting for the resident or a rider to pick up." },
] as const;

export default function VendorOrdersPage({ searchParams }: PageProps<"/vendor/orders">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorOrders searchParams={searchParams} />
    </Suspense>
  );
}

function OrderCard({ order, column }: { order: VendorOrder; column: Tab }) {
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  const delivery = order.fulfillment === "DELIVERY";
  return (
    <li
      className={`rounded-2xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] ${
        column === "new" ? "border-amber-200 ring-2 ring-amber-100" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <p className="font-bold text-ink">{orderCode(order.id)}</p>
        <span className="text-xs text-muted">{timeAgo(order.createdAt)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-4">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${delivery ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-700"}`}
        >
          {delivery ? <Bike className="size-3.5" aria-hidden /> : <Store className="size-3.5" aria-hidden />}
          {delivery ? "Delivery" : "Pickup"}
        </span>
        {column !== "new" && <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order.fulfillment)}</Badge>}
      </div>

      <ul className="mx-4 mt-3 space-y-1 border-t border-dashed border-line pt-3 text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3">
            <span className="min-w-0 text-ink">
              <span className="font-semibold text-brand-700">{item.quantity}×</span> {item.name}
            </span>
            <span className="shrink-0 text-muted tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mx-4 mt-2 flex items-baseline justify-between border-t border-dashed border-line pt-2 text-sm">
        <span className="text-muted">
          {items} {items === 1 ? "item" : "items"} · {PAYMENT_LABEL[order.checkout.paymentMethod]}
          {order.checkout.paymentStatus === "PAID" && <span className="font-medium text-emerald-700"> · paid</span>}
        </span>
        <span className="font-semibold text-ink tabular-nums">{formatPeso(order.subtotal)}</span>
      </div>

      <div className="mx-4 mt-3 space-y-1.5 rounded-xl bg-canvas px-3 py-2.5 text-[13px]">
        <p className="font-semibold text-ink">{order.checkout.resident.name}</p>
        {order.checkout.resident.phone && (
          <p className="flex items-center gap-2 text-muted">
            <Phone className="size-3.5 shrink-0" aria-hidden />
            {order.checkout.resident.phone}
          </p>
        )}
        {order.checkout.deliveryAddress && (
          <p className="flex gap-2 text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {order.checkout.deliveryAddress}
          </p>
        )}
      </div>
      {order.checkout.notes && (
        <p className="mx-4 mt-2 flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {order.checkout.notes}
        </p>
      )}

      <div className="mt-3 border-t border-line px-4 py-3">
        <OrderActions orderId={order.id} status={order.status} fulfillment={order.fulfillment} riderName={order.rider?.name} />
      </div>
    </li>
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
        { href: "/vendor/orders", label: "Live board", Icon: LayoutGrid, count: counts.new + counts.preparing + counts.ready, active: !history },
        { href: "/vendor/orders?tab=done", label: "History", Icon: History, count: counts.done, active: history },
      ]}
    />
  );

  if (history) {
    const data = await serverApi<OrdersResponse>("/vendor/orders?tab=done");
    return (
      <>
        <PageHeader title="Orders" description="Delivered, collected, declined and cancelled orders." actions={views(data.counts)} />
        <Card>
          {data.orders.length === 0 ? (
            <EmptyState Icon={ClipboardList} title="No finished orders yet" text="Orders move here once they're delivered, collected, declined or cancelled." />
          ) : (
            <div className="overflow-x-auto">
              <table className={`${TABLE} min-w-[820px]`}>
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Order</th>
                    <th className={TH}>Resident</th>
                    <th className={TH}>Dishes</th>
                    <th className={TH}>Payment</th>
                    <th className={`${TH} text-right`}>Food total</th>
                    <th className={TH}>Status</th>
                  </tr>
                </thead>
                <tbody className={TBODY}>
                  {data.orders.map((order) => (
                    <tr key={order.id} className={TR}>
                      <td className={TD}>
                        <p className="font-semibold text-ink">{orderCode(order.id)}</p>
                        <p className="text-xs text-muted">{formatDateTime(order.createdAt)}</p>
                      </td>
                      <td className={TD}>
                        <p className="text-ink">{order.checkout.resident.name}</p>
                        <p className="text-xs text-muted">{order.fulfillment === "DELIVERY" ? `Delivery${order.rider ? ` · ${order.rider.name}` : ""}` : "Pickup"}</p>
                      </td>
                      <td className={`${TD} max-w-64 truncate text-muted`} title={order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}>
                        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </td>
                      <td className={TD}>
                        <p className="text-ink">{PAYMENT_LABEL[order.checkout.paymentMethod]}</p>
                        <p className="text-xs text-muted">
                          {order.checkout.paymentStatus === "PENDING" && ["REJECTED", "CANCELLED"].includes(order.status)
                            ? "Not charged"
                            : paymentStatusLabel(order.checkout.paymentMethod, order.checkout.paymentStatus)}
                        </p>
                      </td>
                      <td className={`${TD} text-right font-semibold text-ink tabular-nums`}>{formatPeso(order.subtotal)}</td>
                      <td className={TD}>
                        <Badge tone={STATUS_TONE[order.status]} dot>
                          {statusLabel(order.status, order.fulfillment)}
                        </Badge>
                        {order.rejectReason && <p className="mt-1 max-w-48 truncate text-xs text-muted">“{order.rejectReason}”</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }

  const [fresh, cooking, ready] = await Promise.all(COLUMNS.map((c) => serverApi<OrdersResponse>(`/vendor/orders?tab=${c.key}`)));
  const byColumn = { new: fresh.orders, preparing: cooking.orders, ready: ready.orders };

  return (
    <>
      <PageHeader title="Orders" description="New orders appear instantly. Accept them, then move them along." actions={views(fresh.counts)} />
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {COLUMNS.map(({ key, title, dot, empty }) => {
          const orders = byColumn[key];
          return (
            <section key={key} aria-labelledby={`col-${key}`} className="rounded-2xl bg-gray-100/70 p-2.5 ring-1 ring-line/60">
              <header className="flex items-center justify-between px-2 pt-1 pb-3">
                <h2 id={`col-${key}`} className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span aria-hidden className={`size-2 rounded-full ${dot}`} />
                  {title}
                </h2>
                <span className="min-w-6 rounded-full bg-white px-2 py-0.5 text-center text-xs font-semibold text-ink tabular-nums shadow-sm">
                  {orders.length}
                </span>
              </header>
              {orders.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-muted">{empty}</p>
              ) : (
                <ul className="space-y-2.5">
                  {orders.map((order) => (
                    <OrderCard key={order.id} order={order} column={key} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
