"use client";

import { ChevronRight, Navigation, Package, Power } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import type { JobsPage } from "@/lib/types";
import { JobCard } from "./job-card";
import { useOpenJobs } from "./use-open-jobs";

/** Home's short list: the few nearest jobs and a link to all of them. */
export function JobsPreview({ initial, limit, busy }: { initial: JobsPage; limit: number; busy: boolean }) {
  const { page, position, locationError } = useOpenJobs({ sort: "nearest", limit, online: initial.online, initial });
  const { online, jobs, total } = page ?? initial;

  return (
    <section aria-labelledby="jobs-near-you">
      <div className="mb-3 flex items-end justify-between">
        <h2 id="jobs-near-you" className="text-lg font-bold text-ink">
          Jobs near you
        </h2>
        {online && total > 0 && (
          <span className="text-sm text-muted">
            {total} open {total === 1 ? "job" : "jobs"}
          </span>
        )}
      </div>

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
        <>
          <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
            <Navigation className="size-3.5 text-sky-600" aria-hidden />
            {position
              ? "The nearest pickups to you."
              : locationError
                ? "Allow location to see the nearest jobs first."
                : "Finding where you are…"}
          </p>
          <ul className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} me={position} busy={busy} />
            ))}
          </ul>
          {total > jobs.length && (
            <Link
              href="/rider/jobs"
              className="mt-3 flex h-12 items-center justify-center gap-1 rounded-xl bg-brand-50 text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              See all {total} jobs
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          )}
        </>
      )}
    </section>
  );
}
