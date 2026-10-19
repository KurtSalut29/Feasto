import { ChevronRight, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCover } from "@/components/app/store-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo } from "@/lib/format";
import { isFinished, orderCode, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { ResidentOrder } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

export default function ResidentOrdersPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentOrders />
    </Suspense>
  );
}

function OrderRow({ order }: { order: ResidentOrder }) {
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  return (
    <li>
      <Link
        href={`/resident/orders/${order.id}`}
        className="flex items-center gap-3 rounded-2xl border border-line p-3 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <StoreCover imageUrl={order.vendor.imageUrl} className="size-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-ink">{order.vendor.name}</p>
            <span className="shrink-0 text-xs text-gray-400">{timeAgo(order.createdAt)}</span>
          </div>
          <p className="text-sm text-muted">
            {orderCode(order.id)} · {items} {items === 1 ? "item" : "items"} ·{" "}
            {formatPeso(Number(order.subtotal) + Number(order.deliveryFee))}
          </p>
          <div className="mt-1">
            <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order.fulfillment)}</Badge>
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-gray-400" aria-hidden />
      </Link>
    </li>
  );
}

async function ResidentOrders() {
  await requireRole("RESIDENT");
  const { orders } = await serverApi<{ orders: ResidentOrder[] }>("/orders");
  const active = orders.filter((o) => !isFinished(o.status));
  const past = orders.filter((o) => isFinished(o.status));

  if (orders.length === 0) {
    return (
      <>
        <MobileHeading title="Orders" subtitle="Track your current orders and see past ones." />
        <EmptyState
          Icon={ReceiptText}
          title="No orders yet"
          text="When you place an order, you can follow it here in real time."
          action={<ButtonLink href="/resident">Browse stores</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <MobileHeading title="Orders" subtitle="Updates arrive live, no need to refresh." />
      {active.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">In progress</h2>
          <ul className="space-y-2">
            {active.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Past orders</h2>
          <ul className="space-y-2">
            {past.map((o) => (
              <OrderRow key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
