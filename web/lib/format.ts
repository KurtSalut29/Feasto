/** "08:00" -> "8:00 AM" */
export function formatTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/** 1234.5 or "1234.50" -> "₱1,234.50" */
export function formatPeso(value: number | string) {
  return peso.format(Number(value));
}

/** "Just now", "5 min ago", "3 h ago", or a date */
export function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return formatDate(iso);
}

/** "Oct 19, 2026" */
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
}

/** "Oct 19, 2026, 3:05 PM" */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Time of day in Manila, e.g. "7:00 PM" */
export function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

/** "Wed, Oct 21" in Manila */
export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
}

/** Today's date in Manila as "YYYY-MM-DD", plus `addDays`. */
export function manilaDate(addDays = 0) {
  return new Date(Date.now() + 8 * 3600_000 + addDays * 86400_000).toISOString().slice(0, 10);
}

/** Days until a date column's date in Manila: 0 is today, negative has passed. */
export function daysLeft(iso: string) {
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(manilaDate())) / 86400_000);
}

/** A permit or license is good through its expiry date and has expired from the day after. */
export const isExpired = (iso: string) => daysLeft(iso) < 0;

/** "Wednesday, October 21" in Manila */
export function todayLabel() {
  return new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" });
}

/** "Good morning" / "Good afternoon" / "Good evening" by the hour in Manila */
export function greeting() {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export type MealTime = "breakfast" | "lunch" | "merienda" | "dinner" | "late";

/** Which meal it is now in Manila: breakfast 5–10, lunch 10–2, merienda 2–5, dinner 5–9, then late night */
export function mealTime(): MealTime {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" }));
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 14) return "lunch";
  if (hour >= 14 && hour < 17) return "merienda";
  if (hour >= 17 && hour < 21) return "dinner";
  return "late";
}

/** "Sunday" in Manila */
export function weekdayLabel() {
  return new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long" });
}

/** The time a server page was drawn, handed to client clocks so their first paint matches */
export function renderTime() {
  return Date.now();
}

/** Whole minutes since a time, for queues ("waiting 12 min") */
export function minutesSince(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

/** 12 -> "12 min", 75 -> "1 hr 15 min" */
export function formatMinutes(minutes: number) {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** 1250 -> "₱1.3K", 980 -> "₱980" for tight spaces */
export function compactPeso(value: number) {
  if (value >= 1000) return `₱${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `₱${Math.round(value)}`;
}

// ---------- Report periods ("YYYY-MM-DD" dates in Manila) ----------

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateParts = (d: string) => ({ y: Number(d.slice(0, 4)), m: SHORT_MONTHS[Number(d.slice(5, 7)) - 1], d: Number(d.slice(8, 10)) });

/**
 * Feasto's way of writing a period, the same on every page and in every report file
 * (kept in step with formatRange in server/src/lib/reportDates.ts):
 * "Oct 11, 2026" · "Oct 1 – 11, 2026" · "Sep 28 – Oct 11, 2026" · "Dec 28, 2025 – Jan 3, 2026".
 */
export function formatRange(from: string, to: string) {
  const a = dateParts(from);
  const b = dateParts(to);
  if (from === to) return `${a.m} ${a.d}, ${a.y}`;
  if (a.y !== b.y) return `${a.m} ${a.d}, ${a.y} – ${b.m} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${a.m} ${a.d} – ${b.m} ${b.d}, ${b.y}`;
  return `${a.m} ${a.d} – ${b.d}, ${b.y}`;
}

const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400_000;
/** Both ends counted: Oct 1 – 11 is 11 days */
export const dayCount = (from: string, to: string) => dayNo(to) - dayNo(from) + 1;
/** "2026-10-01" plus n days */
export const addDays = (d: string, n: number) => new Date((dayNo(d) + n) * 86400_000).toISOString().slice(0, 10);
/** "Thu, Oct 1, 2026" */
export const formatLongDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
