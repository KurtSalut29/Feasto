"use client";

import { ChevronDown, LoaderCircle, Package, Power } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import type { JobsPage } from "@/lib/types";
import { JobCard } from "../job-card";
import { OfflineHint } from "../offline-hint";
import { useOpenJobs, type JobSort } from "../use-open-jobs";

/** The API sends at most 100 jobs at once */
const MAX_SHOWN = 100;

const SORTS: { value: JobSort; label: string }[] = [
  { value: "nearest", label: "Nearest" },
  { value: "pay", label: "Highest pay" },
  { value: "newest", label: "Newest" },
];
const DISTANCES: { value: number | undefined; label: string }[] = [
  { value: undefined, label: "Any distance" },
  { value: 2, label: "Within 2 km" },
  { value: 5, label: "Within 5 km" },
];

/** Every open job, a page at a time, sorted and filtered by the server. */
export function JobList({ initial, pageSize, busy }: { initial: JobsPage; pageSize: number; busy: boolean }) {
  const [sort, setSort] = useState<JobSort>("nearest");
  const [within, setWithin] = useState<number | undefined>();
  const [shown, setShown] = useState(pageSize);
  const { page, loading, position, locationError } = useOpenJobs({ sort, within, limit: shown, online: initial.online, initial });
  const { online, jobs, total, licenseExpired } = page ?? initial;

  const option = (on: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap transition ${on ? "bg-ink text-white" : "text-muted hover:text-ink"}`;

  if (!online) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line p-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-canvas text-muted">
          <Power className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-ink">You&apos;re offline</p>
          <p className="text-sm text-muted">
            <OfflineHint licenseExpired={licenseExpired} />
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none]">
        <div role="group" aria-label="Sort jobs" className="flex shrink-0 gap-0.5 rounded-full bg-canvas p-1">
          {SORTS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => {
                setSort(value);
                setShown(pageSize);
              }}
              className={option(sort === value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* Distance needs the phone's position; without it, every job counts */}
      {position && (
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" role="group" aria-label="How far">
          {DISTANCES.map(({ value, label }) => (
            <button
              key={label}
              type="button"
              aria-pressed={within === value}
              onClick={() => {
                setWithin(value);
                setShown(pageSize);
              }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${
                within === value ? "border-sky-600 bg-sky-600 text-white" : "border-line text-ink hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 mb-3 flex items-center gap-1.5 text-sm text-muted" aria-live="polite">
        {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {total} open {total === 1 ? "job" : "jobs"}
        {within ? ` within ${within} km` : ""}
        {sort === "nearest" && !position && (locationError ? " · allow location to sort by distance" : " · finding where you are…")}
      </p>

      {jobs.length === 0 ? (
        <EmptyState
          Icon={Package}
          title={within ? `No jobs within ${within} km` : "No jobs right now"}
          text={within ? "Try a wider distance." : "Stay online. New delivery orders show up the moment a store accepts them."}
        />
      ) : (
        <>
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} me={position} busy={busy} />
            ))}
          </ul>
          <p className="mt-4 text-center text-sm text-muted">
            Showing {jobs.length} of {total}
          </p>
          {jobs.length < total && shown < MAX_SHOWN && (
            <button
              type="button"
              onClick={() => setShown((n) => n + pageSize)}
              disabled={loading}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink transition hover:bg-canvas disabled:opacity-60"
            >
              Show more
              <ChevronDown className="size-4" aria-hidden />
            </button>
          )}
          {jobs.length < total && shown >= MAX_SHOWN && (
            <p className="mt-2 text-center text-sm text-muted">Pick a distance to narrow the list down.</p>
          )}
        </>
      )}
    </>
  );
}
