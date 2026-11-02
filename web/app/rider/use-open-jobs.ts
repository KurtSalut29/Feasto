"use client";

import { useState } from "react";
import { useLiveEvent } from "@/components/app/live-updates";
import { useApiData } from "@/components/app/use-api-data";
import { useGeolocation } from "@/components/map/use-my-location";
import type { JobsPage } from "@/lib/types";

export type JobSort = "nearest" | "pay" | "newest";

/** Bumps whenever the open jobs change for any rider, so lists and maps load again. */
export function useJobsChanged() {
  const [tick, setTick] = useState(0);
  useLiveEvent((event) => {
    if (event.type === "jobs.changed") setTick((n) => n + 1);
  });
  return tick;
}

/**
 * The open jobs, measured from the rider's phone. The server sorts and pages them, so the
 * rider gets the nearest few out of however many there are. `initial` (rendered on the
 * server, without the phone's position) shows until the first answer arrives.
 */
export function useOpenJobs({
  sort,
  within,
  limit,
  online,
  initial,
}: {
  sort: JobSort;
  within?: number;
  limit: number;
  online: boolean;
  initial?: JobsPage;
}) {
  const { position, error } = useGeolocation();
  const changed = useJobsChanged();
  // Ask again when the rider has moved about 100 m, not on every GPS tick
  const lat = position?.lat.toFixed(3);
  const lng = position?.lng.toFixed(3);
  const query = new URLSearchParams({
    sort,
    limit: String(limit),
    ...(lat && lng && { lat, lng }),
    ...(lat && within && { within: String(within) }),
  });
  const { data, loading } = useApiData<JobsPage>(`/rider/jobs?${query}`, `${online}:${changed}`);
  return { page: data ?? initial ?? null, loading, position, locationError: error };
}
