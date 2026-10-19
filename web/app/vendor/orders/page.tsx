import { Bike, ClipboardList, MapPin, MessageSquareText, Phone, Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo } from "@/lib/format";
import { orderCode, PAYMENT_LABEL, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { VendorOrder } from "@/lib/types";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Orders" };

const TABS = [
  { key: "new", label: "New" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "done", label: "Done" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const EMPTY: Record<Tab, string> = {
  new: "New orders pop up here instantly, with a sound.",
  preparing: "Orders you accepted and are cooking.",
  ready: "Orders waiting for pickup by the resident or a rider.",
  done: "Delivered, collected, declined and cancelled orders.",
};

export default function VendorOrdersPage({ searchParams }: PageProps<"/vendor/orders">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorOrders searchParams={searchParams} />
    </Suspense>
  );
}

function OrderCard({ order }: { order: VendorOrder }) {
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <li className="rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <p className="text-lg font-bold text-ink">{orderCode(order.id)}</p>
          <Badge tone={order.fulfillment === "DELIVERY" ? "brand" : "neutral"}>
            {order.fulfillment === "DELIVERY" ? (
              <span className="inline-flex items-center gap-1">
                <Bike className="size-3.5" aria-hidden /> Delivery
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Store className="size-3.5" aria-hidden /> Pickup
              </span>
            )}
          </Badge>
          <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order.fulfillment)}</Badge>
        </div>
        <p className="text-sm text-muted">{timeAgo(order.createdAt)}</p>
      </div>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <ul className="space-y-1 text-[15px]">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="text-ink">
                  <span className="font-semibold">{item.quantity}×</span> {item.name}
                </span>
                <span className="text-muted">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-line pt-2 text-sm text-muted">
            {items} {items === 1 ? "item" : "items"} · <span className="font-semibold text-ink">{formatPeso(order.subtotal)}</span> ·{" "}
            {PAYMENT_LABEL[order.checkout.paymentMethod]} ({paymentStatusLabel(order.checkout.paymentMethod, order.checkout.paymentStatus).toLowerCase()})
          </p>
        </div>
        <div className="space-y-1.5 text-sm">
          <p className="font-semibold text-ink">{order.checkout.resident.name}</p>
          {order.checkout.resident.phone && (
            <p className="flex items-center gap-2 text-muted">
              <Phone className="size-4" aria-hidden />
              {order.checkout.resident.phone}
            </p>
          )}
          {order.checkout.deliveryAddress && (
            <p className="flex gap-2 text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {order.checkout.deliveryAddress}
            </p>
          )}
          {order.checkout.notes && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
              <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
              {order.checkout.notes}
            </p>
          )}
          {order.rejectReason && <p className="text-red-600">Reason: {order.rejectReason}</p>}
        </div>
      </div>
      {!["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"].includes(order.status) && (
        <div className="border-t border-line px-5 py-3">
          <OrderActions orderId={order.id} status={order.status} fulfillment={order.fulfillment} riderName={order.rider?.name} />
        </div>
      )}
    </li>
  );
}

async function VendorOrders({ searchParams }: Pick<PageProps<"/vendor/orders">, "searchParams">) {
  await requireRole("VENDOR");
  const params = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === params.tab)?.key ?? "new";
  const data = await serverApi<{ orders: VendorOrder[]; counts: Record<Tab, number> }>(`/vendor/orders?tab=${tab}`);

  return (
    <>
      <PageHeader title="Orders" description="New orders appear instantly. Accept them, then move them along." />
      <LinkTabs
        tabs={TABS.map((t) => ({
          href: `/vendor/orders?tab=${t.key}`,
          label: t.label,
          count: t.key === "done" ? undefined : data.counts[t.key],
          active: t.key === tab,
        }))}
      />
      <div className="mt-5">
        {data.orders.length === 0 ? (
          <Card>
            <EmptyState Icon={ClipboardList} title={`No ${TABS.find((t) => t.key === tab)!.label.toLowerCase()} orders`} text={EMPTY[tab]} />
          </Card>
        ) : (
          <ul className="space-y-4">
            {data.orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
