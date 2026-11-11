import { z } from "zod";
import { ONLINE_PAYMENTS } from "./payments.js";

/**
 * Rating the rider, the Grab way: after a delivery arrives the resident gives the rider stars,
 * taps what stood out, and may add a tip. The store's rating is separate (Review), because a
 * late rider shouldn't cost the kitchen its stars, or the other way around.
 */

/** Quick picks for 4 and 5 stars */
export const RIDER_PRAISE = ["On time", "Friendly", "Careful with the food", "Followed my note", "Easy to reach"] as const;
/** Quick picks for 1 to 3 stars */
export const RIDER_ISSUES = ["Late", "Food was damaged", "Not polite", "Hard to reach", "Went to the wrong place"] as const;

/** How long after it arrives a delivery can still be rated and tipped */
export const RATE_RIDER_DAYS = 7;
export const MAX_TIP = 500;

const TAGS = new Set<string>([...RIDER_PRAISE, ...RIDER_ISSUES]);

export const riderRatingSchema = z
  .object({
    rating: z.number().int().min(1, "Choose 1 to 5 stars.").max(5, "Choose 1 to 5 stars."),
    tags: z
      .array(z.string())
      .max(5)
      .default([])
      .refine((tags) => tags.every((t) => TAGS.has(t)), "Choose from the options shown."),
    comment: z.string().trim().max(300, "Keep it under 300 characters.").optional(),
    /** Whole pesos; 0 for no tip */
    tip: z.number().int("Tips are in whole pesos.").min(0).max(MAX_TIP, `Tips go up to ₱${MAX_TIP}.`).default(0),
    /** The e-wallet or card for the tip. Online orders use the one they were paid with. */
    tipMethod: z.enum(ONLINE_PAYMENTS).optional(),
  })
  // Praise goes with good ratings and issues with poor ones, so a tag always means what it says
  .transform((v) => ({ ...v, tags: [...new Set(v.tags)].filter((t) => (v.rating >= 4 ? RIDER_PRAISE : RIDER_ISSUES).includes(t as never)) }));

/** "Angelica Reyes" → "Angelica R.", how residents are shown to riders and to each other */
export function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

/** "4.8" from running totals, or null before the first rating */
export const averageOf = (sum: number, count: number) => (count ? Math.round((sum / count) * 10) / 10 : null);
