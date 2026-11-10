import { z } from "zod";
import { CACHE_KEYS, cached, invalidate } from "./redisCache.js";
import { prisma } from "./db.js";

/** A rush hour: from and to are Manila time ("11:00"), days are 0 = Sunday to 6 = Saturday. */
export type PeakWindow = { name: string; from: string; to: string; days: number[] };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const DEFAULT_PEAK_HOURS: PeakWindow[] = [
  { name: "Lunch rush", from: "11:00", to: "13:00", days: EVERY_DAY },
  { name: "Dinner rush", from: "17:00", to: "20:00", days: EVERY_DAY },
];

/** Used until the admin saves their own, and for a freshly reset database. */
export const DEFAULT_SETTINGS = {
  /** Base delivery fee, covering the first `deliveryBaseKm` km by road */
  deliveryFee: 39,
  deliveryBaseKm: 1,
  /** For each km (or part of one) after that */
  deliveryPerKm: 8,
  /** Added during a rush hour */
  deliveryPeakFee: 10,
  /** When the rush-hour add-on applies; the system checks the time at each checkout */
  peakHours: DEFAULT_PEAK_HOURS,
  storeRiderSeconds: 60,
  riderWaveSeconds: 30,
  stuckMinutes: 15,
};

export type Settings = typeof DEFAULT_SETTINGS;

const whole = (min: number, max: number, unit: string) => {
  const message = `Enter ${min} to ${max} ${unit}.`;
  return z.number(message).int(message).min(min, message).max(max, message);
};

const peso = (max: number) => {
  const message = `Enter ₱0 to ₱${max}.`;
  return z
    .number(message)
    .min(0, message)
    .max(max, message)
    .refine((value) => Number.isInteger(Math.round(value * 1e6) / 1e4), "Use at most two decimal places.");
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = z.string("Use a time like 11:00.").regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 11:00.");
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const peakWindow = z.object({
  name: z.string("Name each rush hour, e.g. Lunch rush.").trim().min(1, "Name each rush hour, e.g. Lunch rush.").max(30, "Keep each name under 30 letters."),
  from: clock,
  to: clock,
  days: z
    .array(z.number().int().min(0).max(6), "Pick the days.")
    .min(1, "Pick at least one day for each rush hour.")
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
});

const peakHours = z
  .array(peakWindow, "Add the rush hours.")
  .max(6, "Up to 6 rush hours.")
  .superRefine((list, ctx) => {
    list.forEach((w) => {
      if (minutesOf(w.to) <= minutesOf(w.from)) ctx.addIssue({ code: "custom", message: `${w.name}: the end time must be later than the start, on the same day.` });
    });
    // Two rush hours on the same day can't cover the same minutes, or the add-on would be unclear
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i]!, list[j]!];
        const day = a.days.find((d) => b.days.includes(d));
        if (day !== undefined && minutesOf(a.from) < minutesOf(b.to) && minutesOf(b.from) < minutesOf(a.to)) {
          ctx.addIssue({ code: "custom", message: `${a.name} and ${b.name} overlap on ${DAY_NAMES[day]}. Change one of their times or days.` });
        }
      }
    }
  });

export const settingsSchema = z.object({
  deliveryFee: peso(500),
  deliveryBaseKm: z
    .number("Enter 0 to 20 km.")
    .min(0, "Enter 0 to 20 km.")
    .max(20, "Enter 0 to 20 km.")
    .refine((value) => Number.isInteger(Math.round(value * 1e4) / 1e3), "Use at most one decimal place, e.g. 2.5."),
  deliveryPerKm: peso(100),
  deliveryPeakFee: peso(200),
  peakHours,
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
    const { deliveryFee, deliveryBaseKm, deliveryPerKm, deliveryPeakFee, storeRiderSeconds, riderWaveSeconds, stuckMinutes } = row;
    const saved = peakHours.safeParse(row.peakHours);
    return {
      deliveryFee: Number(deliveryFee),
      deliveryBaseKm: Number(deliveryBaseKm),
      deliveryPerKm: Number(deliveryPerKm),
      deliveryPeakFee: Number(deliveryPeakFee),
      peakHours: saved.success ? saved.data : DEFAULT_PEAK_HOURS,
      storeRiderSeconds,
      riderWaveSeconds,
      stuckMinutes,
    };
  });
}

export const clearSettingsCache = () => invalidate(CACHE_KEYS.settings);
