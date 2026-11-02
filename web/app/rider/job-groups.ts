import { pinOf, type LatLng } from "@/lib/geo";
import type { RiderJob } from "@/lib/types";

export type JobGroup = { id: string; at: LatLng; jobs: RiderJob[] };

/**
 * Jobs from the same store share one map pin; otherwise pins on the exact same spot stack and
 * only the top one can be tapped. The group's id is its first job's id.
 */
export function groupJobsByStore(jobs: RiderJob[]): JobGroup[] {
  const groups = new Map<string, JobGroup>();
  for (const job of jobs) {
    const at = pinOf(job.vendor.latitude, job.vendor.longitude);
    if (!at) continue;
    const key = `${at.lat},${at.lng}`;
    const group = groups.get(key);
    if (group) group.jobs.push(job);
    else groups.set(key, { id: job.id, at, jobs: [job] });
  }
  return [...groups.values()];
}

/** Names of the stores in a group, once each. Usually one; more when stores share a building. */
export const groupStores = (group: JobGroup) => [...new Set(group.jobs.map((job) => job.vendor.name))];

/**
 * The store's name on its pin, with the number of jobs when there's more than one; for stores
 * sharing a spot, the first name and how many others. The pay shows once it's tapped.
 */
export function groupLabel(group: JobGroup) {
  const stores = groupStores(group);
  if (stores.length > 1) return `${stores[0]} +${stores.length - 1} more`;
  return group.jobs.length === 1 ? stores[0] : `${stores[0]} · ${group.jobs.length} jobs`;
}
