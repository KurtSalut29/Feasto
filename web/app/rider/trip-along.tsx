"use client";

import { Route, Store } from "lucide-react";
import { useApiData } from "@/components/app/use-api-data";
import { formatPeso } from "@/lib/format";
import { AcceptJobButton } from "./accept-job-button";

type Along = {
  base: { id: string; code: string } | null;
  jobs: { id: string; code: string; store: string; storeAddress: string; deliveryAddress: string; deliveryFee: number; items: number; sameStore: boolean; storeMeters: number; doorKm: number }[];
};

/**
 * On a delivery, before the pickup: orders that fit on the same trip (the store near the first one,
 * the door near the first door), so the rider can take a second and earn both fees in one ride.
 */
export function TripAlong() {
  const { data } = useApiData<Along>("/rider/jobs/along");
  if (!data?.base || data.jobs.length === 0) return null;
  return (
    <section aria-labelledby="along" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
      <h2 id="along" className="flex items-center gap-2 font-semibold text-ink">
        <Route className="size-5 text-emerald-700" aria-hidden />
        On your way: take one more
      </h2>
      <p className="mt-0.5 text-sm text-muted">These fit on the same trip as {data.base.code}. Pick up both, then drop both. You earn both fees.</p>
      <ul className="mt-3 space-y-3">
        {data.jobs.map((j) => (
          <li key={j.id} className="rounded-xl border border-line bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0">
                <span className="block font-semibold text-ink">
                  {j.code} · {j.store}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <Store className="size-3.5" aria-hidden />
                  {j.sameStore ? "Same store" : `${j.storeMeters} m from your pickup`} · door {j.doorKm} km from your drop-off
                </span>
                <span className="block truncate text-xs text-muted">{j.deliveryAddress}</span>
              </p>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-bold text-emerald-800 tabular-nums">+{formatPeso(j.deliveryFee)}</span>
            </div>
            <div className="mt-2">
              <AcceptJobButton orderId={j.id} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
