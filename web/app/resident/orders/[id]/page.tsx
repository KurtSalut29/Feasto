import { ArrowLeft, Bike, LoaderCircle, MapPin, Phone, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { OrderProgress } from "@/components/app/order-progress";
import { RiderTracking } from "@/components/app/rider-tracking";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { VEHICLE_LABEL } from "@/lib/labels";
import { orderCode, PAYMENT_LABEL, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { ResidentOrder } from "@/lib/types";
import { CancelOrderButton } from "./cancel-button";
import { RateOrder, ReorderButton } from "./order-feedback";

export const metadata: Metadata = { title: "Order" };

type RiderLocation = { lat: number; lng: number; at: string } | null;

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
  const { order, riderLocation } = await serverApi<{ order: ResidentOrder; riderLocation: RiderLocation }>(`/orders/${id}`);
  const total = Number(order.subtotal) + Number(order.deliveryFee);
  const dropped = order.status === "REJECTED" || order.status === "CANCELLED";
  const received = order.status === "DELIVERED" || order.status === "COMPLETED";

  return (
    <>
      <Link href="/resident/orders" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Orders
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{order.vendor.name}</h1>
          <p className="text-sm text-muted">
            Order {orderCode(order.id)} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
          </p>
        </div>
        <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, order.fulfillment)}</Badge>
      </div>

      <div className="space-y-4">
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

        {order.status === "PICKED_UP" && <RiderTracking orderId={order.id} initial={riderLocation} />}

        {order.rider && !dropped && (
          <Section title="Your rider">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Bike className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{order.rider.name}</p>
                {order.rider.riderProfile && (
                  <p className="text-sm text-muted">
                    {VEHICLE_LABEL[order.rider.riderProfile.vehicleType]}
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
              <span className="text-muted">Delivery fee</span>
              <span className="text-ink">{Number(order.deliveryFee) ? formatPeso(order.deliveryFee) : "Free"}</span>
            </div>
            <div className="flex justify-between font-bold text-ink">
              <span>Total</span>
              <span>{formatPeso(total)}</span>
            </div>
            <p className="text-sm text-muted">
              {PAYMENT_LABEL[order.checkout.paymentMethod]} · {paymentStatusLabel(order.checkout.paymentMethod, order.checkout.paymentStatus)}
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

        {(order.status === "PLACED" || order.status === "AWAITING_PAYMENT") && <CancelOrderButton orderId={order.id} />}
        {(received || dropped) && <ReorderButton orderId={order.id} />}
      </div>
    </>
  );
}
