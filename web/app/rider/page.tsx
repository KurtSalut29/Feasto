import { Bike, MapPin, Package, Power, Store } from "lucide-react";
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
              <li key={job.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_24px_-20px_rgba(31,45,61,0.5)]">
                <div className="flex items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-muted">You earn</p>
                    <p className="text-xl leading-tight font-bold text-ink">{formatPeso(job.deliveryFee)}</p>
                  </div>
                  <Badge tone={job.status === "READY" ? "success" : "neutral"}>{job.status === "READY" ? "Ready now" : "Being prepared"}</Badge>
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
                    {items} {items === 1 ? "item" : "items"} · ordered {timeAgo(job.createdAt)}
                  </p>
                  <div className="mt-3">
                    {active ? <p className="text-center text-sm text-muted">Finish your current delivery first.</p> : <AcceptJobButton orderId={job.id} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
