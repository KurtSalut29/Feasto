"use client";

import { Banknote, CalendarClock, CreditCard, MapPin } from "lucide-react";
import { useArrival } from "@/components/app/arrival";
import { StoreCover } from "@/components/app/store-card";
import { Badge } from "@/components/ui/badge";
import { formatPeso, timeAgo } from "@/lib/format";
import { distanceKm, formatDistance, pinOf, type LatLng } from "@/lib/geo";
import { itemsSummary, riderEarns, riderPayment } from "@/lib/order-status";
import { clockOf } from "@/lib/schedule";
import type { RiderJob } from "@/lib/types";
import { AcceptJobButton } from "./accept-job-button";

/**
 * One open job: the pay, the store (with its photo) and the customer, how far, what's in the
 * order and what it costs, whether there's cash to collect, and the Accept button.
 */
export function JobCard({ job, me, busy, arrivals }: { job: RiderJob; me: LatLng | null; busy: boolean; /** The live list it's in: a job arriving later rises in */ arrivals?: string }) {
  const arrived = useArrival(arrivals, job.id, "rise");
  const store = pinOf(job.vendor.latitude, job.vendor.longitude);
  const home = pinOf(job.checkout.deliveryLat, job.checkout.deliveryLng);
  const toPickup = me && store ? distanceKm(me, store) : null;
  const trip = store && home ? distanceKm(store, home) : null;
  const items = job.items.reduce((n, i) => n + i.quantity, 0);
  const total = Number(job.subtotal) + Number(job.deliveryFee);
  const payment = riderPayment(job.checkout);

  return (
    <li onAnimationEnd={arrived.onAnimationEnd} className={`overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_-20px_rgba(31,45,61,0.5)] ${arrived.className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted">You earn</p>
          <p className="text-xl leading-tight font-bold text-ink">{formatPeso(riderEarns(job))}</p>
          {Number(job.riderCut) > 0 && (
            <p className="text-[0.6875rem] text-muted tabular-nums">
              {formatPeso(job.deliveryFee)} fee − {formatPeso(job.riderCut!)} Feasto · tips all yours
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={job.status === "READY" ? "success" : "neutral"}>{job.status === "READY" ? "Ready now" : "Being prepared"}</Badge>
          {toPickup !== null && <span className="text-xs font-semibold text-sky-700">{formatDistance(toPickup)} to pickup</span>}
        </div>
      </div>
      <div className="px-4 py-3">
        {/* The route: store at the top, customer at the bottom, joined by a dashed line */}
        <ol className="relative space-y-3 text-sm before:absolute before:top-9 before:bottom-5 before:left-[17px] before:border-l-2 before:border-dashed before:border-line">
          <li className="relative flex gap-3">
            <StoreCover imageUrl={job.vendor.imageUrl} className="z-10 size-9 shrink-0 rounded-full ring-4 ring-white" />
            <span className="min-w-0">
              <span className="block text-xs text-muted">Pick up at</span>
              <span className="block font-semibold text-ink">{job.vendor.name}</span>
              <span className="block text-muted">{job.vendor.address}</span>
            </span>
          </li>
          <li className="relative flex gap-3">
            <span className="z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white ring-4 ring-white">
              <MapPin className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted">Deliver to</span>
              <span className="block text-ink">{job.checkout.deliveryAddress}</span>
            </span>
          </li>
        </ol>

        <div className="mt-3 rounded-xl bg-canvas px-3 py-2.5 text-sm">
          <p className="truncate text-ink">{itemsSummary(job.items)}</p>
          <p className="mt-1 flex items-center justify-between gap-2">
            <span className="text-muted">
              {items} {items === 1 ? "item" : "items"} · order total <span className="font-semibold text-ink">{formatPeso(total)}</span>
            </span>
            <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${payment.cash ? "text-amber-800" : "text-emerald-700"}`}>
              {payment.cash ? <Banknote className="size-3.5" aria-hidden /> : <CreditCard className="size-3.5" aria-hidden />}
              {payment.cash ? "Collect cash" : "Paid online"}
            </span>
          </p>
        </div>

        {job.scheduledFor && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
            <CalendarClock className="size-3.5" aria-hidden />
            Scheduled: deliver by {clockOf(job.scheduledFor)}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          {trip !== null && `${formatDistance(trip)} trip · `}ordered{" "}
          {/* The minute can tick over between the server's render and the browser's */}
          <time dateTime={job.createdAt} suppressHydrationWarning>
            {timeAgo(job.createdAt).toLowerCase()}
          </time>
        </p>
        <div className="mt-3">
          {busy ? <p className="text-center text-sm text-muted">Finish your current delivery first.</p> : <AcceptJobButton orderId={job.id} />}
        </div>
      </div>
    </li>
  );
}
