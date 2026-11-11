import { Bike, CalendarClock, HandCoins, LoaderCircle, MapPin, Phone, ReceiptText, Star, Store, TimerReset } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { OrderChat } from "@/components/app/order-chat";
import { PushCard } from "@/components/app/push-card";
import { OrderProgress } from "@/components/app/order-progress";
import { OrderMoments } from "@/components/app/receipt-moment";
import { RiderTracking } from "@/components/app/rider-tracking";
import { StoreCover } from "@/components/app/store-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDateTime, formatPeso } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { hasReceipt, ONLINE_LABEL, orderCode, paymentName, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { canRateRider, riderAverage } from "@/lib/rider-ratings";
import { clockOf, sendAtOf, whenOf } from "@/lib/schedule";
import { serverApi } from "@/lib/server-api";
import type { AutoCancel, OrderStatus, ResidentOrder } from "@/lib/types";
import { CancelOrderButton } from "./cancel-button";
import { RateOrder, ReorderButton } from "./order-feedback";
import { RateRider } from "./rate-rider";

export const metadata: Metadata = { title: "Order" };

type RiderLocation = { lat: number; lng: number; at: string } | null;

/** A delivery shows its map from the moment the store accepts it until it arrives. */
const ON_THE_WAY: OrderStatus[] = ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"];

export default function OrderPage({ params }: PageProps<"/resident/orders/[id]">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

async function OrderDetail({ params }: Pick<PageProps<"/resident/orders/[id]">, "params">) {
  await requireRole("RESIDENT");
  const { id } = await params;
  const { order, riderLocation, autoCancel } = await serverApi<{ order: ResidentOrder; riderLocation: RiderLocation; autoCancel: AutoCancel }>(`/orders/${id}`);
  const total = Number(order.subtotal) + Number(order.deliveryFee);
  const dropped = order.status === "REJECTED" || order.status === "CANCELLED";
  const received = order.status === "DELIVERED" || order.status === "COMPLETED";
  const onTheWay = order.fulfillment === "DELIVERY" && ON_THE_WAY.includes(order.status);
  const riderRating = riderAverage(order.rider?.riderProfile);
  const vehicle = order.rider?.riderProfile
    ? [order.rider.riderProfile.vehicleModel ?? "Motorcycle", order.rider.riderProfile.plateNumber].filter(Boolean).join(" · ")
    : null;
  const tip = Number(order.tip ?? 0);
  const scheduled = order.status === "SCHEDULED" && order.scheduledFor;

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <StoreCover imageUrl={order.vendor.imageUrl} className="size-14 shrink-0 rounded-2xl" eager />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink">{order.vendor.name}</h1>
          <p className="text-sm text-muted">
            Order {orderCode(order.id)} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
          </p>
          {order.scheduledFor && !scheduled && !dropped && !received && (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
              <CalendarClock className="size-3.5" aria-hidden />
              Scheduled for {clockOf(order.scheduledFor)}
            </p>
          )}
        </div>
        {/* Keyed by the status, so it pops each time the order moves on */}
        <span key={order.status} className="shrink-0 motion-safe:animate-pop">
          <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order.fulfillment)}</Badge>
        </span>
      </div>

      <OrderMoments
        order={{
          id: order.id,
          code: orderCode(order.id),
          storeName: order.vendor.name,
          fulfillment: order.fulfillment,
          status: order.status,
          paymentMethod: order.checkout.paymentMethod,
          paymentStatus: order.checkout.paymentStatus,
          paymentLabel: paymentName(order.checkout),
          createdAt: order.createdAt,
          finishedAt: order.finishedAt,
          items: order.items,
          deliveryFee: Number(order.deliveryFee),
          total,
        }}
      />

      {/* Big screens: two columns, read top to bottom (the live map first) */}
      <div className="space-y-4 lg:block lg:columns-2 lg:gap-6 lg:space-y-0 lg:[&>*]:mb-4 lg:[&>*]:break-inside-avoid">
        {/* Talk to the store and the rider (hidden once the chat has closed with nothing in it) */}
        <OrderChat orderId={order.id} />
        {!dropped && !received && <PushCard place="order" />}
        {/* Live tracking comes first: it's what the resident opens this page for */}
        {onTheWay && (
          <RiderTracking
            orderId={order.id}
            initial={riderLocation}
            store={pinOf(order.vendor.latitude, order.vendor.longitude)}
            storeName={order.vendor.name}
            home={pinOf(order.checkout.deliveryLat, order.checkout.deliveryLng)}
            homeAddress={order.checkout.deliveryAddress}
            rider={
              order.rider && { name: order.rider.name, phone: order.rider.phone, vehicle, rating: riderRating }
            }
            pickedUp={order.status === "PICKED_UP"}
          />
        )}
        {/* What happens if nobody takes it, so the resident isn't left wondering */}
        {autoCancel && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
            <TimerReset className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <p>
              {autoCancel.why === "NO_STORE_REPLY" ? (
                <>
                  If {order.vendor.name} doesn&apos;t accept it by <strong>{formatClock(autoCancel.at)}</strong>, Feasto cancels it by itself and tells you.{" "}
                  {order.checkout.paymentMethod === "COD" ? "You won't pay anything." : "Your payment is refunded."}
                </>
              ) : (
                <>
                  Finding a rider. If none is free by <strong>{formatClock(autoCancel.at)}</strong>, Feasto cancels it by itself and tells you and the store.{" "}
                  {order.checkout.paymentMethod === "COD" ? "You won't pay anything." : "Your payment is refunded."}
                </>
              )}
            </p>
          </div>
        )}
        {order.status === "AWAITING_PAYMENT" && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            <p className="text-sm font-medium">Confirming your online payment…</p>
          </div>
        )}
        {/* Ordered for later: when it comes and when the store starts on it, in place of the steps */}
        {scheduled && (
          <section className="rounded-2xl border border-sky-100 bg-gradient-to-b from-sky-50 to-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-sky-800">
              <CalendarClock className="size-5 text-sky-600" aria-hidden />
              Scheduled {order.fulfillment === "DELIVERY" ? "delivery" : "pickup"}
            </p>
            <p className="mt-1 text-[22px] leading-tight font-bold tracking-tight text-ink">{whenOf(order.scheduledFor!)}</p>
            <ol className="mt-3 space-y-2 text-sm">
              <li className="flex gap-2.5">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500" />
                <span className="text-ink">
                  <strong className="tabular-nums">{clockOf(sendAtOf(order.scheduledFor!, order.fulfillment))}</strong> · {order.vendor.name} gets your order and starts on it
                </span>
              </li>
              <li className="flex gap-2.5">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-300" />
                <span className="text-ink">
                  <strong className="tabular-nums">{clockOf(order.scheduledFor!)}</strong> · {order.fulfillment === "DELIVERY" ? "It arrives at your door" : "It's ready for you to pick up"}
                </span>
              </li>
            </ol>
            <p className="mt-3 text-[13px] text-muted">
              You can cancel any time before the store gets it.{" "}
              {order.checkout.paymentMethod === "COD" ? "You pay when you receive it." : "Your online payment is refunded if you cancel."}
            </p>
          </section>
        )}
        {dropped ? (
          <Alert tone="error" title={order.status === "REJECTED" ? "The store couldn't take this order" : "This order was cancelled"}>
            {order.rejectReason ?? "No reason given."}
            {order.checkout.paymentStatus === "REFUNDED" && " Your online payment was refunded."}
          </Alert>
        ) : scheduled ? null : (
          <Section title="Progress">
            <OrderProgress
              status={order.status}
              fulfillment={order.fulfillment}
              times={{
                createdAt: order.createdAt,
                acceptedAt: order.acceptedAt,
                readyAt: order.readyAt,
                pickedUpAt: order.pickedUpAt,
                finishedAt: order.finishedAt,
              }}
            />
          </Section>
        )}

        {received && <RateOrder orderId={order.id} storeName={order.vendor.name} review={order.review} />}
        {/* The rider gets their own stars (and maybe a tip), apart from the store's */}
        {order.status === "DELIVERED" && order.rider && (
          <RateRider
            orderId={order.id}
            rider={{ name: order.rider.name, vehicle }}
            given={order.riderRating ?? null}
            tip={tip}
            tipMethod={order.tipMethod ?? null}
            paidWith={order.checkout.paymentMethod === "ONLINE" ? (order.checkout.onlineMethod ?? null) : null}
            open={canRateRider(order.finishedAt)}
          />
        )}

        {order.deliveryPhotoUrl && (
          <Section title="Proof of delivery">
            <a href={order.deliveryPhotoUrl} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-canvas">
              <Image src={order.deliveryPhotoUrl} alt={`Photo of your order taken by ${order.rider?.name ?? "the rider"}`} fill unoptimized className="object-cover" />
            </a>
            <p className="mt-2 text-sm text-muted">
              Taken by {order.rider?.name ?? "your rider"}
              {order.finishedAt && ` · ${formatDateTime(order.finishedAt)}`}
            </p>
          </Section>
        )}


        {/* While it's on the way, the rider is shown with the live map at the top */}
        {order.rider && !dropped && !onTheWay && (
          <Section title="Your rider">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Bike className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <span className="truncate">{order.rider.name}</span>
                  {riderRating !== null && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px]">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                      {riderRating.toFixed(1)}
                      <span className="sr-only"> out of 5 from residents</span>
                    </span>
                  )}
                </p>
                {vehicle && <p className="text-sm text-muted">{vehicle}</p>}
              </div>
              {order.rider.phone && (
                <a
                  href={`tel:${order.rider.phone}`}
                  aria-label={`Call ${order.rider.name}`}
                  className="flex size-10 items-center justify-center rounded-full border border-line text-ink hover:bg-canvas"
                >
                  <Phone className="size-4" aria-hidden />
                </a>
              )}
            </div>
          </Section>
        )}

        <Section title="Your order">
          <ul className="space-y-2 text-[15px]">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0 text-ink">
                  {item.quantity}× {item.name}
                  {item.note && <span className="block text-[13px] text-amber-800">“{item.note}”</span>}
                </span>
                <span className="text-muted">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-line pt-3 text-[15px]">
            <div className="flex justify-between">
              <span className="text-muted">Delivery fee{order.deliveryKm ? ` (${Number(order.deliveryKm).toFixed(1)} km)` : ""}</span>
              <span className="text-ink">{Number(order.deliveryFee) ? formatPeso(order.deliveryFee) : "Free"}</span>
            </div>
            <div className="flex justify-between font-bold text-ink">
              <span>Total</span>
              <span>{formatPeso(total)}</span>
            </div>
            <p className="text-sm text-muted">
              {paymentName(order.checkout)} · {paymentStatusLabel(order.checkout.paymentMethod, order.checkout.paymentStatus)}
            </p>
            {/* Paid on its own after the delivery, so it isn't part of the order's total */}
            {tip > 0 && (
              <p className="flex items-center justify-between gap-3 pt-1 text-[15px]">
                <span className="flex items-center gap-1.5 text-muted">
                  <HandCoins className="size-4 text-emerald-600" aria-hidden />
                  Tip for {order.rider?.name.split(" ")[0] ?? "your rider"}
                  {order.tipMethod && ` · ${ONLINE_LABEL[order.tipMethod]}`}
                </span>
                <span className="font-semibold text-emerald-700 tabular-nums">{formatPeso(tip)}</span>
              </p>
            )}
          </div>
        </Section>

        <Section title={order.fulfillment === "DELIVERY" ? "Delivery details" : "Pickup details"}>
          <div className="space-y-2 text-[15px]">
            {order.fulfillment === "DELIVERY" ? (
              <p className="flex gap-2 text-ink">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {order.checkout.deliveryAddress}
              </p>
            ) : (
              <p className="flex gap-2 text-ink">
                <Store className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                {order.vendor.address}
              </p>
            )}
            {order.checkout.notes && <p className="text-muted">Note: {order.checkout.notes}</p>}
            {order.vendor.owner.phone && (
              <a href={`tel:${order.vendor.owner.phone}`} className="inline-flex items-center gap-2 font-semibold text-brand-700">
                <Phone className="size-4" aria-hidden />
                Call the store
              </a>
            )}
          </div>
        </Section>

        {hasReceipt(order) && (
          <ButtonLink href={`/resident/orders/${order.id}/receipt`} variant="secondary" className="w-full">
            <ReceiptText className="size-[18px]" aria-hidden />
            View receipt
          </ButtonLink>
        )}
        {(order.status === "PLACED" || order.status === "AWAITING_PAYMENT" || order.status === "SCHEDULED") && <CancelOrderButton orderId={order.id} />}
        {(received || dropped) && <ReorderButton orderId={order.id} />}
      </div>
    </>
  );
}
