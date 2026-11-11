import { Bike, LoaderCircle, MapPin, Phone, ReceiptText, Store, TimerReset } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
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
import { hasReceipt, orderCode, paymentName, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { AutoCancel, OrderStatus, ResidentOrder } from "@/lib/types";
import { CancelOrderButton } from "./cancel-button";
import { RateOrder, ReorderButton } from "./order-feedback";

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

  return (
    <>
      <div className="mb-4 flex items-start gap-3">
        <StoreCover imageUrl={order.vendor.imageUrl} className="size-14 shrink-0 rounded-2xl" eager />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink">{order.vendor.name}</h1>
          <p className="text-sm text-muted">
            Order {orderCode(order.id)} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
          </p>
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
              order.rider && {
                name: order.rider.name,
                phone: order.rider.phone,
                vehicle: order.rider.riderProfile
                  ? [order.rider.riderProfile.vehicleModel ?? "Motorcycle", order.rider.riderProfile.plateNumber].filter(Boolean).join(" · ")
                  : null,
              }
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
        {dropped ? (
          <Alert tone="error" title={order.status === "REJECTED" ? "The store couldn't take this order" : "This order was cancelled"}>
            {order.rejectReason ?? "No reason given."}
            {order.checkout.paymentStatus === "REFUNDED" && " Your online payment was refunded."}
          </Alert>
        ) : (
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
                <p className="font-semibold text-ink">{order.rider.name}</p>
                {order.rider.riderProfile && (
                  <p className="text-sm text-muted">
                    {order.rider.riderProfile.vehicleModel ?? "Motorcycle"}
                    {order.rider.riderProfile.plateNumber && ` · ${order.rider.riderProfile.plateNumber}`}
                  </p>
                )}
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
                <span className="text-ink">
                  {item.quantity}× {item.name}
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
        {(order.status === "PLACED" || order.status === "AWAITING_PAYMENT") && <CancelOrderButton orderId={order.id} />}
        {(received || dropped) && <ReorderButton orderId={order.id} />}
      </div>
    </>
  );
}
