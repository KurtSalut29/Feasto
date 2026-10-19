import { Banknote, Bike, MapPin, MessageSquareText, Navigation, Phone, Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { orderCode, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { RiderDelivery } from "@/lib/types";
import { DeliveryActions } from "./delivery-actions";
import { LocationSharer } from "./location-sharer";

export const metadata: Metadata = { title: "Active delivery" };

const mapsLink = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export default function RiderActivePage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderActive />
    </Suspense>
  );
}

function Stop({ Icon, label, title, address, phone }: { Icon: typeof Store; label: string; title: string; address: string; phone: string | null }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-2 flex gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{title}</p>
          <p className="text-sm text-muted">{address}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={mapsLink(address)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-canvas"
        >
          <Navigation className="size-4" aria-hidden />
          Directions
        </a>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink hover:bg-canvas"
          >
            <Phone className="size-4" aria-hidden />
            Call
          </a>
        )}
      </div>
    </section>
  );
}

function Box({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-line p-4">{children}</section>;
}

async function RiderActive() {
  await requireRole("RIDER");
  const { order } = await serverApi<{ order: RiderDelivery | null }>("/rider/active");

  if (!order) {
    return (
      <>
        <MobileHeading title="Active delivery" />
        <EmptyState
          Icon={Bike}
          title="No active delivery"
          text="When you accept a job, the pickup store, the customer's address and the status buttons appear here."
          action={<ButtonLink href="/rider">See jobs</ButtonLink>}
        />
      </>
    );
  }

  const collect = Number(order.subtotal) + Number(order.deliveryFee);
  const cash = order.checkout.paymentMethod === "COD" && order.checkout.paymentStatus !== "PAID";

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Order {orderCode(order.id)}</h1>
          <p className="text-sm text-muted">You earn {formatPeso(order.deliveryFee)}</p>
        </div>
        <Badge tone={STATUS_TONE[order.status]}>{statusLabel(order.status, "DELIVERY")}</Badge>
      </div>

      <div className="space-y-3">
        <DeliveryActions orderId={order.id} status={order.status} />
        {order.status === "PICKED_UP" && <LocationSharer orderId={order.id} />}

        <Stop
          Icon={Store}
          label={order.status === "PICKED_UP" ? "Picked up from" : "1. Pick up at"}
          title={order.vendor.name}
          address={order.vendor.address}
          phone={order.vendor.owner.phone}
        />
        <Stop
          Icon={MapPin}
          label="2. Deliver to"
          title={order.checkout.resident.name}
          address={order.checkout.deliveryAddress ?? ""}
          phone={order.checkout.resident.phone}
        />

        {cash && (
          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
            <Banknote className="size-6 shrink-0" aria-hidden />
            <p className="text-sm">
              Collect <span className="text-base font-bold">{formatPeso(collect)}</span> in cash from the customer.
            </p>
          </div>
        )}

        <Box>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Items</p>
          <ul className="space-y-1 text-[15px] text-ink">
            {order.items.map((item) => (
              <li key={item.id}>
                <span className="font-semibold">{item.quantity}×</span> {item.name}
              </li>
            ))}
          </ul>
          {order.checkout.notes && (
            <p className="mt-2 flex gap-2 text-sm text-muted">
              <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
              {order.checkout.notes}
            </p>
          )}
        </Box>
      </div>
    </>
  );
}
