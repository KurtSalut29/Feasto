import { ArrowRight, Bike } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ApprovalNotice } from "@/components/app/approval-notice";
import { ExpiryNotice } from "@/components/app/expiry-notice";
import { VerificationForm } from "@/components/app/verification-form";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { StepBar } from "@/components/app/step-bar";
import { StoreCover } from "@/components/app/store-card";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { deliverySteps, orderCode, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { JobsPage, RiderDelivery } from "@/lib/types";
import type { Verification } from "@/lib/verification-fields";
import { JobsPreview } from "./jobs-preview";
import { RiderHero, type Totals } from "./rider-hero";

export const metadata: Metadata = { title: "Home" };

/** How many jobs Home shows; the rest are one tap away on the jobs list */
const PREVIEW_SIZE = 3;

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
    const store = profile.vendor?.name ?? null;
    const canEdit = profile.status === "PENDING" || profile.status === "REJECTED";
    const verification = canEdit ? await serverApi<Verification>("/documents/verification") : null;
    return (
      <>
        <RiderHero firstName={firstName} line="Welcome to Feasto for riders." />
        <ApprovalNotice
          status={profile.status}
          reviewNote={profile.reviewNote}
          reviewer={store ?? "the admin"}
          pendingText={`${store ?? "A Feasto admin"} is checking your license and motorcycle details. You can go online and accept jobs once you're approved.`}
          blockedText={`You can't go online or accept jobs right now. Please contact ${store ?? "the Feasto admin"}.`}
        />
        {canEdit && verification && (
          <div className="mt-4">
            <VerificationForm role="RIDER" data={verification} />
          </div>
        )}
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
      <RiderHero firstName={firstName} online={jobs.online} totals={totals} />

      <ExpiryNotice date={profile?.licenseExpiresAt} documentName="driver's license" href="/rider/license" blocked="You can't go online until your renewed license is approved. Tap to send it." />

      {active && <CurrentDelivery order={active} />}

      <JobsPreview initial={jobs} limit={PREVIEW_SIZE} busy={Boolean(active)} storeName={profile?.vendor?.name ?? null} />
    </>
  );
}

/** The delivery the rider is on, with how far along it is, above everything else on Home. */
function CurrentDelivery({ order }: { order: RiderDelivery }) {
  const { steps, done } = deliverySteps(order.status);
  return (
    <Link
      href="/rider/active"
      className="mb-5 block rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-4 shadow-[0_10px_24px_-18px_rgba(178,58,0,0.6)] transition hover:border-brand-500/40 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-brand-700 uppercase">
          <Bike className="size-4" aria-hidden />
          Current delivery
        </p>
        <span className="text-sm font-bold text-ink tabular-nums">+{formatPeso(order.deliveryFee)}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <StoreCover imageUrl={order.vendor.imageUrl} className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">
            {order.vendor.name} <span className="font-normal text-muted">· {orderCode(order.id)}</span>
          </p>
          <p className="truncate text-sm text-muted">To {order.checkout.deliveryAddress}</p>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-brand-700">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
        </span>
        {statusLabel(order.status, "DELIVERY")}
      </p>
      <div className="mt-2">
        <StepBar steps={steps} done={done} />
      </div>
      <p className="mt-3 flex items-center justify-end gap-1 border-t border-brand-100 pt-3 text-sm font-semibold text-brand-700">
        Continue delivery
        <ArrowRight className="size-4" aria-hidden />
      </p>
    </Link>
  );
}
