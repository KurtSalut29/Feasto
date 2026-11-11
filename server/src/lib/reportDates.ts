import { z } from "zod";

/** Today in Manila as "YYYY-MM-DD" */
export const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

const DAY = 86400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;

/** How many days a period covers, counting both ends ("Oct 1 – Oct 11" is 11 days) */
export const dayCount = (from: string, to: string) => dayNumber(to) - dayNumber(from) + 1;

/** Every date from `from` to `to`, both included */
export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) out.push(new Date(n * DAY).toISOString().slice(0, 10));
  return out;
}

/** The longest period one report can cover */
export const MAX_REPORT_DAYS = 366;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.").refine((d) => !Number.isNaN(Date.parse(d)), "Pick a real date.");

/** A report period: both dates in Manila, oldest first, not in the future, at most a year long. */
export const periodSchema = z
  .object({ from: date, to: date })
  .refine((v) => v.from <= v.to, { path: ["to"], message: "The end date must be on or after the start date." })
  .refine((v) => v.to <= manilaToday(), { path: ["to"], message: "Pick dates up to today. Future days have no sales yet." })
  .refine((v) => dayCount(v.from, v.to) <= MAX_REPORT_DAYS, { path: ["to"], message: "A report can cover up to a year. Pick a shorter period." });

/** The period as times: from midnight of `from` to the midnight after `to`, in Manila */
export const manilaRange = (from: string, to: string) => ({
  gte: new Date(`${from}T00:00:00+08:00`),
  lt: new Date(Date.parse(`${to}T00:00:00+08:00`) + DAY),
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (d: string) => ({ y: Number(d.slice(0, 4)), m: MONTHS[Number(d.slice(5, 7)) - 1], d: Number(d.slice(8, 10)) });

/**
 * Feasto's way of writing a period, the same on the page and in every report file:
 * "Oct 11, 2026" · "Oct 1 – 11, 2026" · "Sep 28 – Oct 11, 2026" · "Dec 28, 2025 – Jan 3, 2026".
 * (Kept in step with formatRange in web/lib/format.ts.)
 */
export function formatRange(from: string, to: string) {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${a.m} ${a.d}, ${a.y}`;
  if (a.y !== b.y) return `${a.m} ${a.d}, ${a.y} – ${b.m} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${a.m} ${a.d} – ${b.m} ${b.d}, ${b.y}`;
  return `${a.m} ${a.d} – ${b.d}, ${b.y}`;
}

/** "Oct 11, 2026" */
export const formatDay = (d: string) => formatRange(d, d);

/** "Oct 2026" for a month bucket "2026-10" */
export const formatMonth = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** "Nov 11, 2026, 3:05 PM" in Manila */
export const formatStamp = (at: Date) =>
  at.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
