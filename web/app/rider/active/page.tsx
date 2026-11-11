import { Banknote, Check, CreditCard, Map as MapIcon, MapPin, MessageSquareText, Phone, Store, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { StepBar } from "@/components/app/step-bar";
import { StoreCover } from "@/components/app/store-card";
import { DirectionsButton } from "@/components/map/directions-button";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { pinOf, type LatLng } from "@/lib/geo";
import { deliverySteps, orderCode, paymentName, riderPayment, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { RiderDelivery } from "@/lib/types";
import { OrderChat } from "@/components/app/order-chat";
import { DeliveryActions } from "./delivery-actions";
import { LocationSharer } from "./location-sharer";
import { RiderTripMap } from "./rider-trip-map";

export const metadata: Metadata = { title: "Active delivery" };

export default function RiderActivePage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderActive />
    </Suspense>
  );
}

const pill =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-line px-3.5 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * One end of the trip: who and where, with in-app directions and a call button. A dashed line
 * joins it to the next. The store's stop shows its photo.
 */
function Stop({
  Icon,
  imageUrl,
  label,
  title,
  address,
  phone,
  pin,
  near,
  kind,
  done,
  last,
  extra,
}: {
  Icon: LucideIcon;
  /** The store's photo, shown in the dot in place of the icon */
  imageUrl?: string | null;
  label: string;
  title: string;
  address: string;
  phone: string | null;
  pin: LatLng | null;
  /** Where to look for an address saved without a pin */
  near?: LatLng | null;
  kind: "store" | "home";
  done?: boolean;
  last?: boolean;
  /** More buttons beside Directions and Call */
  extra?: ReactNode;
}) {
  return (
    <li className={`relative flex gap-3 ${last ? "" : "pb-5"}`}>
      {!last && <span aria-hidden className="absolute top-10 bottom-1 left-[17px] border-l-2 border-dashed border-line" />}
      {imageUrl !== undefined ? (
        <span className="relative z-10 shrink-0">
          <StoreCover imageUrl={imageUrl} className="size-9 rounded-full ring-4 ring-white" />
          {done && (
            <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-white">
              <Check className="size-3" aria-hidden />
            </span>
          )}
        </span>
      ) : (
        <span
          className={`z-10 flex size-9 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${
            done ? "bg-emerald-50 text-emerald-600" : last ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600"
          }`}
        >
          {done ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold tracking-wider uppercase ${done ? "text-emerald-700" : "text-gray-400"}`}>{label}</p>
        <p className="mt-0.5 font-semibold text-ink">{title}</p>
        <p className="text-sm text-muted">{address}</p>
        <div className="mt-2.5 flex gap-2">
          {(pin || address) && <DirectionsButton to={pin} near={near} name={title} address={address} kind={kind} className={pill} />}
          {phone && (
            <a href={`tel:${phone}`} aria-label={`Call ${title}`} className={pill}>
              <Phone className="size-4 text-brand-600" aria-hidden />
              Call
            </a>
          )}
          {extra}
        </div>
      </div>
    </li>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-gray-400 uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The delivery the rider is on, in the order they need it: how far along it is, the map with
 * the way to the next stop, the next button to press, whether to collect cash, then the route
 * and the order itself with its prices.
 */
async function RiderActive() {
  await requireRole("RIDER");
  const { order } = await serverApi<{ order: RiderDelivery | null }>("/rider/active");

  if (!order) {
    return (
      <>
        <MobileHeading title="Active delivery" />
        <div className="flex flex-col items-center rounded-3xl bg-gradient-to-b from-brand-50 to-white px-6 pt-8 pb-6 text-center">
          <Image src="/Logo/feasto-mascot.png" alt="" width={88} height={88} className="size-22 -rotate-6 object-contain" />
          <p className="mt-3 text-lg font-bold text-ink">No delivery right now</p>
          <p className="mt-1 max-w-xs text-sm text-muted">Accept a job and its pickup, drop-off, map and status buttons show up here.</p>
          <div className="mt-5 flex w-full max-w-xs gap-2">
            <ButtonLink href="/rider" className="flex-1">
              See jobs
            </ButtonLink>
            <ButtonLink href="/rider/map" variant="secondary" className="flex-1">
              <MapIcon className="size-4 text-brand-600" aria-hidden />
              Map
            </ButtonLink>
          </div>
        </div>
      </>
    );
  }

  const store = pinOf(order.vendor.latitude, order.vendor.longitude);
  const home = pinOf(order.checkout.deliveryLat, order.checkout.deliveryLng);
  const total = Number(order.subtotal) + Number(order.deliveryFee);
  const payment = riderPayment(order.checkout);
  const pickedUp = order.status === "PICKED_UP";
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
  const { steps, done } = deliverySteps(order.status);

  return (
    <>
      <section aria-label="Delivery progress" className="mb-3 rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-4">
        <div className="flex items-start gap-3">
          <StoreCover imageUrl={order.vendor.imageUrl} className="size-12 shrink-0 rounded-xl" eager />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink">Order {orderCode(order.id)}</h1>
            <p className="mt-0.5 truncate text-sm text-muted">
              {order.vendor.name} to {order.checkout.resident.name}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-700 tabular-nums">
            <span className="sr-only">You earn </span>+{formatPeso(order.deliveryFee)}
          </span>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-brand-700">
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
          </span>
          {pickedUp ? `On the way to ${order.checkout.resident.name.split(" ")[0]}` : `Heading to ${order.vendor.name} · ${statusLabel(order.status, "DELIVERY")}`}
        </p>
        <div className="mt-2">
          <StepBar steps={steps} done={done} />
        </div>
      </section>

      {/* Laptops up: the map stays on the left while the steps, payment and route sit beside it */}
      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0 lg:[&>*:first-child]:sticky lg:[&>*:first-child]:top-6 lg:[&>*:first-child]:row-span-[12] lg:[&>*:not(:first-child)]:col-start-2">
        <RiderTripMap store={store} home={home} homeAddress={order.checkout.deliveryAddress} status={order.status} />
        <DeliveryActions orderId={order.id} status={order.status} />
        <LocationSharer orderId={order.id} heading={pickedUp ? "home" : "store"} store={store} home={home} />

        {payment.cash ? (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
            <Banknote className="size-6 shrink-0" aria-hidden />
            <p className="text-sm">
              Collect <span className="text-base font-bold">{formatPeso(total)}</span> in cash from the customer.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <CreditCard className="size-6 shrink-0" aria-hidden />
            <p className="text-sm">
              <span className="font-bold">Already paid</span> with {paymentName(order.checkout)}. Collect nothing, just hand it over.
            </p>
          </div>
        )}

        <Box title="Route">
          <ol>
            <Stop
              Icon={Store}
              imageUrl={order.vendor.imageUrl}
              pin={store}
              kind="store"
              label={pickedUp ? "Picked up" : "1 · Pick up at"}
              done={pickedUp}
              title={order.vendor.name}
              address={order.vendor.address}
              phone={order.vendor.owner.phone}
            />
            <Stop
              Icon={MapPin}
              pin={home}
              near={store}
              kind="home"
              label="2 · Deliver to"
              last
              title={order.checkout.resident.name}
              address={order.checkout.deliveryAddress ?? ""}
              phone={order.checkout.resident.phone}
              extra={<OrderChat orderId={order.id} look="pill" />}
            />
          </ol>
        </Box>

        <Box title={`The order · ${itemCount} ${itemCount === 1 ? "item" : "items"}`}>
          <ul className="space-y-2 text-[15px] text-ink">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-2">
                <span className="w-7 shrink-0 font-semibold text-brand-700 tabular-nums">{item.quantity}×</span>
                <span className="min-w-0 flex-1">
                  {item.name}
                  <span className="block text-xs text-muted">{formatPeso(item.unitPrice)} each</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Food</dt>
              <dd className="text-ink tabular-nums">{formatPeso(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Delivery fee (your pay)</dt>
              <dd className="text-ink tabular-nums">{formatPeso(order.deliveryFee)}</dd>
            </div>
            <div className="flex justify-between text-[15px] font-bold text-ink">
              <dt>Order total</dt>
              <dd className="tabular-nums">{formatPeso(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Payment</dt>
              <dd className={`font-semibold ${payment.cash ? "text-amber-800" : "text-emerald-700"}`}>{payment.label}</dd>
            </div>
          </dl>
          {order.checkout.notes && (
            <p className="mt-3 flex gap-2 rounded-xl bg-canvas px-3 py-2 text-sm text-ink">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              {order.checkout.notes}
            </p>
          )}
        </Box>
      </div>
    </>
  );
}
