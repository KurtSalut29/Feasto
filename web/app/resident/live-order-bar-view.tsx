"use client";

import { Bike, ChefHat, ChevronRight, Clock, CreditCard, MapPin, PackageCheck, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Fulfillment, OrderStatus } from "@/lib/types";

export type LiveOrder = {
  id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  storeName: string;
  riderName: string | null;
  /** Other orders in progress besides this one */
  others: number;
};

/** Pages with their own bar at the bottom, or the order's own page, where the map already shows */
const HIDDEN = [/^\/resident\/stores\/[^/]+/, /^\/resident\/cart/, /^\/resident\/checkout/];

function describe(o: LiveOrder) {
  const delivery = o.fulfillment === "DELIVERY";
  switch (o.status) {
    case "AWAITING_PAYMENT":
      return { Icon: CreditCard, line: "Confirming your payment…", sub: o.storeName };
    case "PLACED":
      return { Icon: Clock, line: `Waiting for ${o.storeName} to accept`, sub: "Usually takes a minute or two" };
    case "ACCEPTED":
    case "PREPARING":
      return {
        Icon: ChefHat,
        line: `${o.storeName} is preparing your food`,
        sub: delivery ? (o.riderName ? `${o.riderName} will bring it to you` : "We're finding a rider") : "We'll tell you when it's ready",
      };
    case "READY":
      return delivery
        ? { Icon: Bike, line: o.riderName ? `${o.riderName} is picking up your food` : "Your food is ready", sub: o.riderName ? `At ${o.storeName}` : "Finding a rider near the store" }
        : { Icon: Store, line: "Ready for pickup", sub: `At ${o.storeName}` };
    default:
      return { Icon: Bike, line: `${o.riderName ?? "Your rider"} is on the way to you`, sub: `From ${o.storeName}` };
  }
}

export function LiveOrderBarView({ order }: { order: LiveOrder }) {
  const pathname = usePathname();
  if (pathname === `/resident/orders/${order.id}` || HIDDEN.some((p) => p.test(pathname))) return null;

  const { Icon, line, sub } = describe(order);
  const trackable = order.fulfillment === "DELIVERY" && order.riderName && ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"].includes(order.status);

  return (
    <>
      {/* Room at the end of the page, so the bar never covers the last thing on it */}
      <div aria-hidden className="h-20" />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-[440px] px-3">
        <Link
          href={`/resident/orders/${order.id}`}
          aria-label={`${line}. ${trackable ? "Track your rider live" : "See your order"}`}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-3 text-white shadow-[0_18px_40px_-14px_rgba(31,45,61,0.6)] transition hover:bg-[#263749] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-safe:animate-rise-in"
        >
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500" aria-hidden>
            <Icon className="size-5" />
            <span className="absolute -top-0.5 -right-0.5 flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-3 rounded-full border-2 border-ink bg-emerald-400" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{line}</span>
            <span className="block truncate text-xs text-white/65">
              {sub}
              {order.others > 0 && ` · +${order.others} more ${order.others === 1 ? "order" : "orders"}`}
            </span>
          </span>
          <span className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-white/12 px-3 text-xs font-semibold">
            {trackable ? (
              <>
                <MapPin className="size-3.5" aria-hidden />
                Track
              </>
            ) : order.status === "READY" && order.fulfillment === "PICKUP" ? (
              <>
                <PackageCheck className="size-3.5" aria-hidden />
                View
              </>
            ) : (
              <>
                View
                <ChevronRight className="size-3.5" aria-hidden />
              </>
            )}
          </span>
        </Link>
      </div>
    </>
  );
}
