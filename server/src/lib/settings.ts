import { z } from "zod";
import { CACHE_KEYS, cached, invalidate } from "./cache.js";
import { prisma } from "./db.js";

/** Used until the admin saves their own, and for a freshly reset database. */
export const DEFAULT_SETTINGS = { deliveryFee: 49, storeRiderSeconds: 60, riderWaveSeconds: 30, stuckMinutes: 15 };

export type Settings = typeof DEFAULT_SETTINGS;

const whole = (min: number, max: number, unit: string) => {
  const message = `Enter ${min} to ${max} ${unit}.`;
  return z.number(message).int(message).min(min, message).max(max, message);
};

export const settingsSchema = z.object({
  deliveryFee: z
    .number("Enter ₱0 to ₱500.")
    .min(0, "Enter ₱0 to ₱500.")
    .max(500, "Enter ₱0 to ₱500.")
    .refine((value) => Number.isInteger(value * 100), "Use at most two decimal places."),
  storeRiderSeconds: whole(10, 600, "seconds"),
  riderWaveSeconds: whole(10, 300, "seconds"),
  stuckMinutes: whole(1, 240, "minutes"),
});

/**
 * The admin's settings. Every checkout and worker reads these, so they're kept in Redis, and
 * saving clears that copy for every API copy and worker at once.
 */
export function getSettings(): Promise<Settings> {
  return cached(CACHE_KEYS.settings, 60, async () => {
    const row = await prisma.platformSettings.findUnique({ where: { id: 1 } });
    if (!row) return DEFAULT_SETTINGS;
    const { deliveryFee, storeRiderSeconds, riderWaveSeconds, stuckMinutes } = row;
    return { deliveryFee: Number(deliveryFee), storeRiderSeconds, riderWaveSeconds, stuckMinutes };
  });
}

export const clearSettingsCache = () => invalidate(CACHE_KEYS.settings);
