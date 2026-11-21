import { Banknote, Bike, CalendarClock, ChevronRight, CreditCard, MapPin, MessageSquareText, Phone, Printer, Store, TimerReset } from "lucide-react";
import Link from "next/link";
import { OrderChat } from "@/components/app/order-chat";
import { Badge } from "@/components/ui/badge";
import { formatClock, formatPeso } from "@/lib/format";
import { clockOf } from "@/lib/schedule";
import { pinOf, type LatLng } from "@/lib/geo";
import { orderCode, STATUS_TONE, statusLabel } from "@/lib/order-status";
import type { VendorOrder } from "@/lib/types";
import { EtaLine } from "@/components/app/order-eta";
import { OrderActions } from "./order-actions";
import { IF_UNAVAILABLE_WORDS, RanOutButton } from "./ran-out-button";
import { commissionLine, DishThumb, paymentLine } from "./order-parts";
import { RiderLive } from "./rider-live";
import { WaitClock } from "./wait-clock";
import { DiscountRows } from "@/components/app/discount-rows";

/**
 * Everything about one order in the queue: the next step first, then the dishes with their
 * photos, what the customer pays and how, who it's for, and the rider coming for it (live).
 * `map` adds the rider's live map; the phone view leaves it for the order's own page.
 */
export function OrderPanel({
  order,
  store,
  position,
  renderedAt,
  map = false,
}: {
  order: VendorOrder;
  store: LatLng | null;
  /** Place in the queue, counting from 1 */
  position: number;
  renderedAt: number;
  map?: boolean;
}) {
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  const delivery = order.fulfillment === "DELIVERY";
  const fee = Number(order.deliveryFee);
  const payment = paymentLine(order);
  const cut = commissionLine(order);
  const riderShown = Boolean(delivery && order.rider);

  return (
    <article aria-label={`Order ${orderCode(order.id)}`} className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-ink">{orderCode(order.id)}</span>
            <Badge tone={STATUS_TONE[order.status]} dot>
              {statusLabel(order.status, order.fulfillment)}
            </Badge>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>
              No. {position} in line · {order.scheduledFor ? `came in ${formatClock(order.placedAt ?? order.createdAt)}` : `placed ${formatClock(order.createdAt)}`}
            </span>
            <WaitClock since={order.placedAt ?? order.createdAt} status={order.status} renderedAt={renderedAt} />
          </p>
          {/* Ordered for later: the time the resident wants it, so the kitchen works to it */}
          {order.scheduledFor && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-sm font-semibold text-sky-800 ring-1 ring-sky-100">
              <CalendarClock className="size-4" aria-hidden />
              Scheduled: {delivery ? "deliver by" : "ready by"} {clockOf(order.scheduledFor)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/vendor/orders/${order.id}/slip`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <Printer className="size-4" aria-hidden />
            Slip
          </Link>
          <Link
            href={`/vendor/orders/${order.id}`}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            Full page
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      {/* The next step, where the eye lands first */}
      <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3.5">
        <p className="mb-2 text-[0.6875rem] font-semibold tracking-wider text-brand-700 uppercase">Next step</p>
        {order.autoCancel && (
          <p className="mb-2.5 flex items-start gap-2 rounded-xl bg-white px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            <TimerReset className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            {order.autoCancel.why === "NO_STORE_REPLY" ? (
              <span>
                Accept by <strong>{formatClock(order.autoCancel.at)}</strong>, or Feasto cancels it by itself and tells the customer.
              </span>
            ) : (
              <span>
                No rider yet. If none takes it by <strong>{formatClock(order.autoCancel.at)}</strong>, Feasto cancels it and tells you and the customer.
              </span>
            )}
          </p>
        )}
        <EtaLine eta={order.eta} ready={order.status === "READY"} delays={order.delays} delayNote={order.delayNote} className="mb-2.5 bg-white" />
        <OrderActions
          orderId={order.id}
          status={order.status}
          fulfillment={order.fulfillment}
          riderName={order.rider?.name}
          dispatch={order.dispatch}
          riderShown={riderShown}
          estimateMinutes={order.estimateMinutes}
        />
      </div>

      {order.checkout.notes && (
        <p className="flex gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Note: </span>
            {order.checkout.notes}
          </span>
        </p>
      )}

      <section aria-label="Dishes" className="rounded-2xl border border-line">
        <p className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink">
            {items} {items === 1 ? "item" : "items"} to prepare
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${delivery ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-700"}`}
          >
            {delivery ? <Bike className="size-3.5" aria-hidden /> : <Store className="size-3.5" aria-hidden />}
            {delivery ? "Delivery" : "Pickup"}
          </span>
        </p>
        <ul className="divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${item.removedAt ? "opacity-60" : ""}`}>
              <DishThumb src={item.menuItem?.imageUrl} className="size-11" />
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white tabular-nums">
                {item.quantity}×
              </span>
              <span className={`min-w-0 flex-1 font-medium text-ink ${item.removedAt ? "line-through" : ""}`}>
                {item.name}
                {item.removedAt && <span className="block text-xs font-semibold text-amber-800 no-underline">Ran out: taken off the order</span>}
                {item.note && (
                  <span className="mt-1 flex items-start gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[0.8125rem] font-semibold text-amber-900 ring-1 ring-amber-200">
                    <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">{item.note}</span>
                  </span>
                )}
              </span>
              <span className="shrink-0 text-muted tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
              {!item.removedAt && ["PLACED", "ACCEPTED", "PREPARING"].includes(order.status) && (
                <RanOutButton orderId={order.id} itemId={item.id} name={item.name} choice={order.checkout.ifUnavailable ?? "REMOVE"} phone={order.checkout.resident.phone} />
              )}
            </li>
          ))}
        </ul>
        {["PLACED", "ACCEPTED", "PREPARING"].includes(order.status) && (
          <p className="border-t border-line px-4 py-2 text-xs text-muted">If something runs out, the customer asked: {IF_UNAVAILABLE_WORDS[order.checkout.ifUnavailable ?? "REMOVE"]}.</p>
        )}
        <dl className="space-y-1 border-t border-dashed border-line px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Food</dt>
            <dd className="text-ink tabular-nums">{formatPeso(order.subtotal)}</dd>
          </div>
          {delivery && (
            <div className="flex justify-between">
              <dt className="text-muted">Delivery fee (goes to the rider)</dt>
              <dd className="text-ink tabular-nums">{fee ? formatPeso(fee) : "Free"}</dd>
            </div>
          )}
          <DiscountRows lines={order.discounts} forStore />
          <div className="flex justify-between text-base font-semibold text-ink">
            <dt>Customer pays</dt>
            <dd className="tabular-nums">{formatPeso(payment.total)}</dd>
          </div>
          {cut && (
            <>
              <div className="flex justify-between pt-1 text-[0.8125rem]">
                <dt className="text-muted">{cut.label}</dt>
                <dd className="text-muted tabular-nums">{cut.commission ? `−${formatPeso(cut.commission)}` : formatPeso(0)}</dd>
              </div>
              {cut.storeDiscount > 0 && (
                <div className="flex justify-between pt-1 text-[0.8125rem]">
                  <dt className="text-muted">Your discounts</dt>
                  <dd className="text-muted tabular-nums">−{formatPeso(cut.storeDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-[0.8125rem] font-semibold text-ink">
                <dt>You receive for the food</dt>
                <dd className="tabular-nums">{formatPeso(cut.youReceive)}</dd>
              </div>
              <p className="text-xs text-muted">{cut.how}.</p>
            </>
          )}
        </dl>
        <p
          className={`mx-4 mb-3 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${
            payment.tone === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {payment.tone === "paid" ? <CreditCard className="size-3.5" aria-hidden /> : <Banknote className="size-3.5" aria-hidden />}
          {payment.text}
        </p>
      </section>

      <section aria-label="Customer" className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-2xl bg-canvas px-4 py-3 text-sm">
          <p className="text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">Customer</p>
          <p className="font-semibold text-ink">{order.checkout.resident.name}</p>
          {order.checkout.resident.phone && (
            <a href={`tel:${order.checkout.resident.phone}`} className="flex w-fit items-center gap-2 text-brand-700 hover:underline">
              <Phone className="size-3.5 shrink-0" aria-hidden />
              {order.checkout.resident.phone}
            </a>
          )}
          <OrderChat orderId={order.id} look="link" label="Order chat" />
        </div>
        <div className="space-y-1.5 rounded-2xl bg-canvas px-4 py-3 text-sm">
          <p className="text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">{delivery ? "Deliver to" : "Pickup"}</p>
          <p className="flex gap-2 text-ink">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
            {order.checkout.deliveryAddress ?? "The customer collects it at your store."}
          </p>
        </div>
      </section>

      {riderShown && order.rider && (
        <section aria-label="Rider" className="rounded-2xl border border-line p-3.5">
          <RiderLive
            orderId={order.id}
            rider={order.rider}
            initial={order.riderLocation ?? null}
            status={order.status}
            store={store}
            home={pinOf(order.checkout.deliveryLat, order.checkout.deliveryLng)}
            homeAddress={order.checkout.deliveryAddress}
            map={map}
          />
        </section>
      )}
    </article>
  );
}
