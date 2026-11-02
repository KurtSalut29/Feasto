import { ArrowRight, Bike, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/app/approval-notice";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { formatPeso, greeting, todayLabel } from "@/lib/format";
import { orderCode, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { JobsPage, RiderDelivery } from "@/lib/types";
import { JobsPreview } from "./jobs-preview";

export const metadata: Metadata = { title: "Home" };

/** How many jobs Home shows; the rest are one tap away on the jobs list */
const PREVIEW_SIZE = 3;

type Totals = { today: { count: number; earnings: number }; allTime: { count: number; earnings: number } };

export default function RiderHomePage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderHome />
    </Suspense>
  );
}

async function RiderHome() {
  const user = await requireRole("RIDER");
  const firstName = user.name.split(" ")[0];
  const profile = user.riderProfile;
  if (profile && profile.status !== "APPROVED") {
    return (
      <>
        <MobileHeading title={`Hi, ${firstName}!`} subtitle="Welcome to Feasto for riders." />
        <ApprovalNotice
          status={profile.status}
          reviewNote={profile.reviewNote}
          pendingText="An admin is checking your vehicle details. You can go online and accept jobs once you're approved."
          blockedText="You can't go online or accept jobs right now. Please contact the Feasto admin."
        />
      </>
    );
  }

  const [jobs, { order: active }, { totals }] = await Promise.all([
    serverApi<JobsPage>(`/rider/jobs?limit=${PREVIEW_SIZE}`),
    serverApi<{ order: RiderDelivery | null }>("/rider/active"),
    serverApi<{ totals: Totals }>("/rider/history"),
  ]);

  return (
    <>
      <div className="mb-4">
        <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">{todayLabel()}</p>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          {greeting()}, {firstName}!
        </h1>
      </div>

      {/* Today at a glance */}
      <Link
        href="/rider/history"
        className="mb-4 flex items-center gap-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-[0_16px_32px_-18px_rgba(178,58,0,0.7)]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Wallet className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/80">Earned today</p>
          <p className="text-2xl leading-tight font-bold">{formatPeso(totals.today.earnings)}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl leading-tight font-bold">{totals.today.count}</p>
          <p className="text-xs text-white/80">{totals.today.count === 1 ? "delivery" : "deliveries"}</p>
        </div>
      </Link>

      {active && (
        <Link href="/rider/active" className="mb-4 block rounded-2xl border-2 border-brand-500 bg-white p-4 transition hover:bg-brand-50/40">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-brand-700 uppercase">
              <Bike className="size-4" aria-hidden />
              Current delivery
            </p>
            <Badge tone={STATUS_TONE[active.status]}>{statusLabel(active.status, "DELIVERY")}</Badge>
          </div>
          <p className="mt-2 font-semibold text-ink">
            {active.vendor.name} <span className="font-normal text-muted">· {orderCode(active.id)}</span>
          </p>
          <p className="truncate text-sm text-muted">To {active.checkout.deliveryAddress}</p>
          <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-brand-700">
            Continue delivery
            <ArrowRight className="size-4" aria-hidden />
          </p>
        </Link>
      )}

      <JobsPreview initial={jobs} limit={PREVIEW_SIZE} busy={Boolean(active)} />
    </>
  );
}
