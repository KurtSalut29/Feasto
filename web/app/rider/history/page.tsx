import { History, Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso } from "@/lib/format";
import { orderCode } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "History" };

type HistoryResponse = {
  deliveries: { id: string; finishedAt: string; deliveryFee: string; vendor: { name: string }; checkout: { deliveryAddress: string | null } }[];
  totals: { today: { count: number; earnings: number }; allTime: { count: number; earnings: number } };
};

export default function RiderHistoryPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderHistory />
    </Suspense>
  );
}

async function RiderHistory() {
  await requireRole("RIDER");
  const { deliveries, totals } = await serverApi<HistoryResponse>("/rider/history");

  return (
    <>
      <MobileHeading title="History" subtitle="Your completed deliveries and earnings." />
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <Wallet className="size-4" aria-hidden /> Today
          </p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatPeso(totals.today.earnings)}</p>
          <p className="text-sm text-muted">
            {totals.today.count} {totals.today.count === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="text-sm font-medium text-muted">All time</p>
          <p className="mt-1 text-2xl font-bold text-ink">{formatPeso(totals.allTime.earnings)}</p>
          <p className="text-sm text-muted">
            {totals.allTime.count} {totals.allTime.count === 1 ? "delivery" : "deliveries"}
          </p>
        </div>
      </div>
      {deliveries.length === 0 ? (
        <EmptyState Icon={History} title="No deliveries yet" text="Each delivery you complete is listed here, with what you earned." />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {deliveries.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{d.vendor.name}</p>
                <p className="truncate text-sm text-muted">
                  {orderCode(d.id)} · {formatDateTime(d.finishedAt)}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-emerald-700">+{formatPeso(d.deliveryFee)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
