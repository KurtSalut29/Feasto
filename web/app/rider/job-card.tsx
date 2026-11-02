"use client";

import { MapPin, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPeso, timeAgo } from "@/lib/format";
import { distanceKm, formatDistance, pinOf, type LatLng } from "@/lib/geo";
import type { RiderJob } from "@/lib/types";
import { AcceptJobButton } from "./accept-job-button";

/** One open job: the pay, where to pick up and drop off, how far, and the Accept button. */
export function JobCard({ job, me, busy }: { job: RiderJob; me: LatLng | null; busy: boolean }) {
  const store = pinOf(job.vendor.latitude, job.vendor.longitude);
  const home = pinOf(job.checkout.deliveryLat, job.checkout.deliveryLng);
  const toPickup = me && store ? distanceKm(me, store) : null;
  const trip = store && home ? distanceKm(store, home) : null;
  const items = job.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_-20px_rgba(31,45,61,0.5)]">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted">You earn</p>
          <p className="text-xl leading-tight font-bold text-ink">{formatPeso(job.deliveryFee)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={job.status === "READY" ? "success" : "neutral"}>{job.status === "READY" ? "Ready now" : "Being prepared"}</Badge>
          {toPickup !== null && <span className="text-xs font-semibold text-sky-700">{formatDistance(toPickup)} to pickup</span>}
        </div>
      </div>
      <div className="px-4 py-3">
        {/* The route: store at the top, customer at the bottom, joined by a dashed line */}
        <ol className="relative space-y-3 text-sm before:absolute before:top-5 before:bottom-5 before:left-[13px] before:border-l-2 before:border-dashed before:border-line">
          <li className="relative flex gap-3">
            <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-4 ring-white">
              <Store className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted">Pick up at</span>
              <span className="block font-semibold text-ink">{job.vendor.name}</span>
              <span className="block text-muted">{job.vendor.address}</span>
            </span>
          </li>
          <li className="relative flex gap-3">
            <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white ring-4 ring-white">
              <MapPin className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted">Deliver to</span>
              <span className="block text-ink">{job.checkout.deliveryAddress}</span>
            </span>
          </li>
        </ol>
        <p className="mt-3 text-xs text-gray-500">
          {items} {items === 1 ? "item" : "items"}
          {trip !== null && ` · ${formatDistance(trip)} trip`} · ordered{" "}
          {/* The minute can tick over between the server's render and the browser's */}
          <time dateTime={job.createdAt} suppressHydrationWarning>
            {timeAgo(job.createdAt)}
          </time>
        </p>
        <div className="mt-3">
          {busy ? <p className="text-center text-sm text-muted">Finish your current delivery first.</p> : <AcceptJobButton orderId={job.id} />}
        </div>
      </div>
    </li>
  );
}
