import { CalendarClock, ChevronRight, ReceiptText, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { Stars } from "@/components/app/rating";
import { StoreCover } from "@/components/app/store-card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatClock, formatPeso, manilaDate, timeAgo } from "@/lib/format";
import { hasReceipt, isFinished, itemsSummary, orderCode, paymentName, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { clockOf, sendAtOf, whenInSentence } from "@/lib/schedule";
import { serverApi } from "@/lib/server-api";
import type { OrderStatus, ResidentOrder } from "@/lib/types";
import { ReorderButton } from "./[id]/order-feedback";

export const metadata: Metadata = { title: "Orders" };

export default function ResidentOrdersPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentOrders />
    </Suspense>
  );
}

const totalOf = (order: ResidentOrder) => Number(order.subtotal) + Number(order.deliveryFee);
const isReceived = (status: OrderStatus) => status === "DELIVERED" || status === "COMPLETED";

/** How far along a live order is, as steps of a short bar. */
function progress(order: ResidentOrder) {
  const steps = order.fulfillment === "DELIVERY" ? ["Placed", "Preparing", "Ready", "On the way", "Delivered"] : ["Placed", "Preparing", "Ready", "Collected"];
  const at: Partial<Record<OrderStatus, number>> = { AWAITING_PAYMENT: 0, PLACED: 0, ACCEPTED: 1, PREPARING: 1, READY: 2, PICKED_UP: 3 };
  return { steps, done: at[order.status] ?? 0 };
}

/** An order on its way: the store, where it is now, and a bar of the steps left. */
function LiveOrder({ order }: { order: ResidentOrder }) {
  const { steps, done } = progress(order);
  return (
    <li>
      <Link
        href={`/resident/orders/${order.id}`}
        className="block rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-4 shadow-[0_10px_24px_-18px_rgba(178,58,0,0.6)] transition hover:border-brand-500/40 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <div className="flex items-start gap-3">
          <StoreCover imageUrl={order.vendor.imageUrl} className="size-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{order.vendor.name}</p>
            <p className="text-[13px] text-muted">
              {orderCode(order.id)} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"} ·{" "}
              {order.scheduledFor ? `for ${clockOf(order.scheduledFor)}` : `placed ${timeAgo(order.createdAt).toLowerCase()}`}
            </p>
          </div>
          <span className="text-sm font-semibold text-ink tabular-nums">{formatPeso(totalOf(order))}</span>
        </div>

        <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-brand-700">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
          </span>
          {statusLabel(order.status, order.fulfillment)}
        </p>
        <ol className="mt-2 flex gap-1" aria-label={`Step ${done + 1} of ${steps.length}: ${steps[done]}`}>
          {steps.map((step, i) => (
            <li key={step} className={`h-1.5 flex-1 rounded-full ${i <= done ? "bg-brand-600" : "bg-brand-100"}`}>
              <span className="sr-only">
                {step}
                {i <= done ? ", done" : ""}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-1 flex justify-between text-[11px] text-muted" aria-hidden>
          <span>{steps[0]}</span>
          <span>{steps[steps.length - 1]}</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-brand-100 pt-3">
          <p className="min-w-0 truncate text-[13px] text-muted">{itemsSummary(order.items)}</p>
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700">
            Track
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}

/** An order for later: when it's coming, and when the store gets it. */
function ScheduledOrder({ order }: { order: ResidentOrder }) {
  const at = order.scheduledFor!;
  return (
    <li>
      <Link
        href={`/resident/orders/${order.id}`}
        className="block rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50 to-white p-4 transition hover:border-sky-300 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <div className="flex items-start gap-3">
          <StoreCover imageUrl={order.vendor.imageUrl} className="size-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{order.vendor.name}</p>
            <p className="text-[13px] text-muted">
              {orderCode(order.id)} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
            </p>
          </div>
          <span className="text-sm font-semibold text-ink tabular-nums">{formatPeso(totalOf(order))}</span>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-sky-800">
          <CalendarClock className="size-[18px] shrink-0 text-sky-600" aria-hidden />
          {order.fulfillment === "DELIVERY" ? "Arrives" : "Ready"} {whenInSentence(at)}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          {order.vendor.name} gets it at {clockOf(sendAtOf(at, order.fulfillment))}. You can cancel until then.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-sky-100 pt-3">
          <p className="min-w-0 truncate text-[13px] text-muted">{itemsSummary(order.items)}</p>
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-sky-800">
            Details
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
      </Link>
    </li>
  );
}

/** A finished order: what it was, how it ended, and what's left to do with it. */
function PastOrder({ order }: { order: ResidentOrder }) {
  const received = isReceived(order.status);
  return (
    <li className="relative rounded-2xl border border-line bg-white p-3 transition hover:bg-canvas/60 has-[a.stretch:focus-visible]:outline-2 has-[a.stretch:focus-visible]:outline-brand-500">
      <div className="flex gap-3">
        <StoreCover imageUrl={order.vendor.imageUrl} className={`size-14 shrink-0 rounded-xl ${received ? "" : "opacity-60 grayscale"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-ink">
              <Link href={`/resident/orders/${order.id}`} className="stretch outline-none after:absolute after:inset-0 after:content-['']">
                {order.vendor.name}
              </Link>
            </p>
            <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{formatPeso(totalOf(order))}</span>
          </div>
          <p className="truncate text-[13px] text-muted">{itemsSummary(order.items)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order.fulfillment)}</Badge>
            <span>
              {formatClock(order.createdAt)} · {paymentName(order.checkout)}
            </span>
          </div>
        </div>
      </div>

      {/* Above the stretched link, so each one does its own thing */}
      <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {received &&
          (order.review ? (
            <span className="inline-flex h-8 items-center gap-1.5 px-1 text-[13px] text-muted">
              <Stars value={order.review.rating} size="size-3.5" />
              <span className="sr-only">You rated it {order.review.rating} of 5</span>
            </span>
          ) : (
            <Link
              href={`/resident/orders/${order.id}#rate`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-50 px-3 text-[13px] font-semibold text-brand-700 transition hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Star className="size-3.5" aria-hidden />
              Rate it
            </Link>
          ))}
        {hasReceipt(order) && (
          <Link
            href={`/resident/orders/${order.id}/receipt`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[13px] font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <ReceiptText className="size-3.5" aria-hidden />
            Receipt
          </Link>
        )}
        <ReorderButton orderId={order.id} compact />
      </div>
    </li>
  );
}

/** "Today", "Yesterday" or "Mon, Nov 3", by the day in Manila. */
function dayLabel(iso: string) {
  const day = new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  if (day === manilaDate(0)) return "Today";
  if (day === manilaDate(-1)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

async function ResidentOrders() {
  await requireRole("RESIDENT");
  const { orders } = await serverApi<{ orders: ResidentOrder[] }>("/orders");
  const active = orders.filter((o) => !isFinished(o.status) && o.status !== "SCHEDULED");
  // Orders for later, soonest first
  const scheduled = orders
    .filter((o) => o.status === "SCHEDULED" && o.scheduledFor)
    .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime());
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

  const days = new Map<string, ResidentOrder[]>();
  for (const order of past) {
    const label = dayLabel(order.createdAt);
    days.set(label, [...(days.get(label) ?? []), order]);
  }
  const toRate = past.filter((o) => isReceived(o.status) && !o.review).length;

  return (
    <>
      <MobileHeading
        title="Orders"
        subtitle={
          active.length
            ? `${active.length} on the way. Updates arrive live, no need to refresh.`
            : scheduled.length
              ? `${scheduled.length} scheduled for later.`
              : "Your past orders, receipts and ratings."
        }
      />
      {active.length > 0 && (
        <section className="mb-7" aria-labelledby="orders-active">
          <h2 id="orders-active" className="mb-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">
            In progress
          </h2>
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {active.map((o) => (
              <LiveOrder key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
      {scheduled.length > 0 && (
        <section className="mb-7" aria-labelledby="orders-scheduled">
          <h2 id="orders-scheduled" className="mb-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">
            Scheduled
          </h2>
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {scheduled.map((o) => (
              <ScheduledOrder key={o.id} order={o} />
            ))}
          </ul>
        </section>
      )}
      {past.length > 0 && (
        <section aria-labelledby="orders-past">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="orders-past" className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
              Past orders
            </h2>
            {toRate > 0 && (
              <p className="text-xs font-medium text-brand-700">
                {toRate} to rate
              </p>
            )}
          </div>
          <div className="space-y-5">
            {[...days].map(([label, list]) => (
              <div key={label}>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">{label}</h3>
                <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
                  {list.map((o) => (
                    <PastOrder key={o.id} order={o} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
