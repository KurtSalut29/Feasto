import { ArrowLeft, Banknote, Bike, Camera, ClipboardList, CreditCard, MapPin, MessageSquareText, Phone, Printer, User, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { OrderChat } from "@/components/app/order-chat";
import { OrderProgress } from "@/components/app/order-progress";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso } from "@/lib/format";
import { pinOf } from "@/lib/geo";
import { isFinished, orderCode, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { VendorOrderDetail } from "@/lib/types";
import { OrderActions } from "../order-actions";
import { DishThumb, paymentLine } from "../order-parts";
import { RiderLive } from "../rider-live";

export const metadata: Metadata = { title: "Order" };

export default function VendorOrderPage({ params }: PageProps<"/vendor/orders/[id]">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorOrder params={params} />
    </Suspense>
  );
}

/**
 * One order in full for the store: how far along it is, the dishes and what the customer pays,
 * the next step, who it's for, and the rider coming for it on a live map. The order slip prints
 * from here for the kitchen or the bag.
 */
async function VendorOrder({ params }: Pick<PageProps<"/vendor/orders/[id]">, "params">) {
  await requireRole("VENDOR");
  const { id } = await params;
  const { order } = await serverApi<{ order: VendorOrderDetail }>(`/vendor/orders/${id}`);
  const delivery = order.fulfillment === "DELIVERY";
  const dropped = order.status === "REJECTED" || order.status === "CANCELLED";
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  const fee = Number(order.deliveryFee);
  const payment = paymentLine(order);
  const store = pinOf(order.vendor.latitude, order.vendor.longitude);
  const home = pinOf(order.checkout.deliveryLat, order.checkout.deliveryLng);
  const back = isFinished(order.status) ? "/vendor/orders?tab=done" : "/vendor/orders";

  return (
    <>
      <PageHeader
        eyebrow={delivery ? "Delivery order" : "Pickup order"}
        title={`Order ${orderCode(order.id)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Placed {formatDateTime(order.createdAt)}
            <Badge tone={STATUS_TONE[order.status]} dot>
              {statusLabel(order.status, order.fulfillment)}
            </Badge>
          </span>
        }
        actions={
          <>
            <ButtonLink href={back} variant="secondary">
              <ArrowLeft className="size-[18px]" aria-hidden />
              Orders
            </ButtonLink>
            <ButtonLink href={`/vendor/orders/${order.id}/slip`}>
              <Printer className="size-[18px]" aria-hidden />
              Order slip
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {dropped ? (
            <Alert tone="error" title={order.status === "REJECTED" ? "You declined this order" : "The resident cancelled this order"}>
              {order.rejectReason ?? "No reason given."}
            </Alert>
          ) : (
            <Card title="Progress" Icon={ClipboardList}>
              <div className="px-5 py-4">
                <OrderProgress
                  status={order.status}
                  fulfillment={order.fulfillment}
                  times={{ createdAt: order.createdAt, acceptedAt: order.acceptedAt, readyAt: order.readyAt, pickedUpAt: order.pickedUpAt, finishedAt: order.finishedAt }}
                />
              </div>
            </Card>
          )}

          <Card title="Dishes" description={`${count} ${count === 1 ? "item" : "items"}`} Icon={UtensilsCrossed}>
            <ul className="divide-y divide-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <DishThumb src={item.menuItem?.imageUrl} className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">
                      <span className="font-bold text-brand-700">{item.quantity}×</span> {item.name}
                    </p>
                    <p className="text-xs text-muted">{formatPeso(item.unitPrice)} each</p>
                  </div>
                  <p className="shrink-0 font-semibold text-ink tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Food (yours)</dt>
                <dd className="text-ink tabular-nums">{formatPeso(order.subtotal)}</dd>
              </div>
              {delivery && (
                <div className="flex justify-between">
                  <dt className="text-muted">Delivery fee (the rider&apos;s)</dt>
                  <dd className="text-ink tabular-nums">{fee ? formatPeso(fee) : "Free"}</dd>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-bold text-ink">
                <dt>Customer pays</dt>
                <dd className="tabular-nums">{formatPeso(payment.total)}</dd>
              </div>
              <div className="pt-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    payment.tone === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {payment.tone === "paid" ? <CreditCard className="size-3.5" aria-hidden /> : <Banknote className="size-3.5" aria-hidden />}
                  {payment.text}
                </span>
              </div>
            </dl>
          </Card>
        </div>

        <div className="space-y-5">
          {!isFinished(order.status) && (
            <Card title="Next step">
              <div className="px-5 py-4">
                <OrderActions
                  orderId={order.id}
                  status={order.status}
                  fulfillment={order.fulfillment}
                  riderName={order.rider?.name}
                  dispatch={order.dispatch}
                  riderShown={Boolean(delivery && order.rider)}
                />
              </div>
            </Card>
          )}

          <Card title="Customer" Icon={User}>
            <div className="space-y-2 px-5 py-4 text-sm">
              <p className="font-semibold text-ink">{order.checkout.resident.name}</p>
              {order.checkout.resident.phone && (
                <a href={`tel:${order.checkout.resident.phone}`} className="flex items-center gap-2 font-medium text-brand-700 hover:underline">
                  <Phone className="size-4 shrink-0" aria-hidden />
                  {order.checkout.resident.phone}
                </a>
              )}
              <OrderChat orderId={order.id} look="link" label="Order chat" />
              {delivery && order.checkout.deliveryAddress && (
                <p className="flex gap-2 text-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {order.checkout.deliveryAddress}
                </p>
              )}
              {order.checkout.notes && (
                <p className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {order.checkout.notes}
                </p>
              )}
            </div>
          </Card>

          {delivery && !dropped && (
            <Card title="Rider" Icon={Bike}>
              <div className="space-y-3 px-5 py-4">
                {order.rider ? (
                  <RiderLive
                    orderId={order.id}
                    rider={order.rider}
                    initial={order.riderLocation ?? null}
                    status={order.status}
                    store={store}
                    home={home}
                    homeAddress={order.checkout.deliveryAddress}
                    map
                  />
                ) : (
                  <p className="text-sm text-muted">
                    {order.status === "PLACED" ? "A rider is found once you accept the order." : "Looking for a rider near your store. You'll see them here, live, once one accepts."}
                  </p>
                )}
                {order.deliveryPhotoUrl && (
                  <a href={order.deliveryPhotoUrl} target="_blank" rel="noreferrer" className="block">
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-canvas">
                      <Image src={order.deliveryPhotoUrl} alt={`Delivery photo taken by ${order.rider?.name ?? "the rider"}`} fill unoptimized className="object-cover" />
                    </span>
                    <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-brand-700">
                      <Camera className="size-3.5" aria-hidden />
                      Proof of delivery
                    </span>
                  </a>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
