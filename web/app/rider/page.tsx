import { ArrowDown, Bike, MapPin, Package, Power, Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/app/approval-notice";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso, timeAgo } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { RiderDelivery, RiderJob } from "@/lib/types";
import { AcceptJobButton } from "./accept-job-button";

export const metadata: Metadata = { title: "Jobs" };

export default function RiderJobsPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderJobs />
    </Suspense>
  );
}

async function RiderJobs() {
  const user = await requireRole("RIDER");
  const profile = user.riderProfile;
  if (profile && profile.status !== "APPROVED") {
    return (
      <>
        <MobileHeading title="Jobs" subtitle="Delivery orders waiting for a rider." />
        <ApprovalNotice
          status={profile.status}
          reviewNote={profile.reviewNote}
          pendingText="An admin is checking your vehicle details. You can go online and accept jobs once you're approved."
          blockedText="You can't go online or accept jobs right now. Please contact the Feasto admin."
        />
      </>
    );
  }

  const [{ online, jobs }, { order: active }] = await Promise.all([
    serverApi<{ online: boolean; jobs: RiderJob[] }>("/rider/jobs"),
    serverApi<{ order: RiderDelivery | null }>("/rider/active"),
  ]);

  return (
    <>
      <MobileHeading title="Jobs" subtitle="New jobs appear here live." />

      {active && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 p-4">
          <Bike className="size-6 shrink-0 text-brand-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">You have a delivery in progress</p>
            <p className="truncate text-sm text-muted">{active.vendor.name}</p>
          </div>
          <ButtonLink href="/rider/active" className="h-9 px-4 text-sm">
            Open
          </ButtonLink>
        </div>
      )}

      {!online ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
          <span className="flex size-10 items-center justify-center rounded-xl bg-canvas text-muted">
            <Power className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold text-ink">You&apos;re offline</p>
            <p className="text-sm text-muted">Turn on the Online switch above to see delivery jobs.</p>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState Icon={Package} title="No jobs right now" text="Stay online. New delivery orders show up here the moment a store accepts them." />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const items = job.items.reduce((n, i) => n + i.quantity, 0);
            return (
              <li key={job.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-bold text-ink">{formatPeso(job.deliveryFee)}</p>
                  <Badge tone={job.status === "READY" ? "success" : "neutral"}>{job.status === "READY" ? "Ready now" : "Being prepared"}</Badge>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="flex gap-2 text-ink">
                    <Store className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    <span>
                      <span className="font-semibold">{job.vendor.name}</span>
                      <span className="block text-muted">{job.vendor.address}</span>
                    </span>
                  </p>
                  <ArrowDown className="ml-0.5 size-3.5 text-gray-300" aria-hidden />
                  <p className="flex gap-2 text-ink">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    {job.checkout.deliveryAddress}
                  </p>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  {items} {items === 1 ? "item" : "items"} · ordered {timeAgo(job.createdAt)}
                </p>
                <div className="mt-3">
                  {active ? <p className="text-center text-sm text-muted">Finish your current delivery first.</p> : <AcceptJobButton orderId={job.id} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
