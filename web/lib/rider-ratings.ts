/** The same quick picks the server accepts (server/src/lib/riderRatings.ts) */
export const RIDER_PRAISE = ["On time", "Friendly", "Careful with the food", "Followed my note", "Easy to reach"] as const;
export const RIDER_ISSUES = ["Late", "Food was damaged", "Not polite", "Hard to reach", "Went to the wrong place"] as const;

/** How long after it arrives a delivery can still be rated and tipped */
export const RATE_RIDER_DAYS = 7;
export const MAX_TIP = 500;
/** The tips offered as one tap */
export const TIP_AMOUNTS = [20, 30, 50, 100] as const;

/** "4.8" from a rider's running totals, or null before their first rating */
export function riderAverage(profile: { ratingSum?: number; ratingCount?: number } | null | undefined) {
  if (!profile?.ratingCount) return null;
  return Math.round(((profile.ratingSum ?? 0) / profile.ratingCount) * 10) / 10;
}

/** Whether a delivery that arrived at `finishedAt` can still be rated */
export const canRateRider = (finishedAt: string | null) => !finishedAt || Date.now() - new Date(finishedAt).getTime() <= RATE_RIDER_DAYS * 86400_000;
