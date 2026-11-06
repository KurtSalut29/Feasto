import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { JobsPage, RiderDelivery } from "@/lib/types";
import { JobList } from "./job-list";

export const metadata: Metadata = { title: "All jobs" };

/** Jobs shown at first and added by each "Show more" */
const JOBS_PAGE_SIZE = 10;

export default function RiderJobsPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderJobs />
    </Suspense>
  );
}

async function RiderJobs() {
  const user = await requireRole("RIDER");
  // Riders waiting for approval see their status on Home instead
  if (user.riderProfile?.status !== "APPROVED") redirect("/rider");
  const [jobs, { order: active }] = await Promise.all([
    serverApi<JobsPage>(`/rider/jobs?limit=${JOBS_PAGE_SIZE}`),
    serverApi<{ order: RiderDelivery | null }>("/rider/active"),
  ]);
  return (
    <>
      <Link href="/rider" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Home
      </Link>
      <MobileHeading title="All jobs" subtitle={user.riderProfile?.vendor ? `Open delivery jobs from ${user.riderProfile.vendor.name}.` : "The open delivery jobs that have reached you."} />
      <JobList initial={jobs} pageSize={JOBS_PAGE_SIZE} busy={Boolean(active)} />
    </>
  );
}
