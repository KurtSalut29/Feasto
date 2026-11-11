import type { Fulfillment } from "./types";

/** The same rules the server checks (server/src/lib/schedule.ts) */
export const SLOT_MINUTES = 15;
export const MIN_AHEAD_MINUTES = 60;
/** Today and the next two days */
export const SCHEDULE_DAYS = 3;
/** How long before the time the store gets the order to accept */
export const SEND_AHEAD_MINUTES: Record<Fulfillment, number> = { DELIVERY: 45, PICKUP: 30 };

type Hours = { opensAt: string; closesAt: string };

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** "YYYY-MM-DD" in Manila */
const manilaDate = (at: Date) => new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
const manilaMidnight = (date: string) => Date.parse(`${date}T00:00:00+08:00`);

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

export const clockOf = (iso: string | Date) => timeFormat.format(new Date(iso));

/** "Today", "Tomorrow" or "Thu, Nov 14" (Manila dates) */
export function dayOf(iso: string | Date, now = new Date()) {
  const days = Math.round((manilaMidnight(manilaDate(new Date(iso))) - manilaMidnight(manilaDate(now))) / 86400_000);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : dayFormat.format(new Date(iso));
}

/** "Today, 6:30 PM", "Tomorrow, 8:00 AM", "Thu, Nov 14, 6:30 PM" */
export const whenOf = (iso: string | Date, now = new Date()) => `${dayOf(iso, now)}, ${clockOf(iso)}`;

/** The same, inside a sentence: "today, 6:30 PM" */
export const whenInSentence = (iso: string | Date, now = new Date()) => whenOf(iso, now).replace(/^(Today|Tomorrow)/, (d) => d.toLowerCase());

/** When the store gets a scheduled order to accept */
export const sendAtOf = (iso: string, fulfillment: Fulfillment) => new Date(new Date(iso).getTime() - SEND_AHEAD_MINUTES[fulfillment] * 60_000);

export type ScheduleDay = { date: string; label: string; times: { iso: string; label: string }[] };

/**
 * The times a cart can be ordered for: every 15 minutes from an hour from now, within the hours of
 * every store in it (each has to be open when it gets the order and at the time itself).
 */
export function scheduleDays(stores: Hours[], fulfillment: Fulfillment, now = new Date()): ScheduleDay[] {
  const lead = SEND_AHEAD_MINUTES[fulfillment];
  const earliest = now.getTime() + MIN_AHEAD_MINUTES * 60_000;
  const today = manilaDate(now);
  const days: ScheduleDay[] = [];
  for (let d = 0; d < SCHEDULE_DAYS; d++) {
    const midnight = manilaMidnight(today) + d * 86400_000;
    const times: ScheduleDay["times"] = [];
    for (let m = 0; m < 24 * 60; m += SLOT_MINUTES) {
      const at = midnight + m * 60_000;
      if (at < earliest) continue;
      const fits = stores.every(({ opensAt, closesAt }) => {
        const opens = toMinutes(opensAt);
        const closes = toMinutes(closesAt);
        return (opens === 0 && closes >= 24 * 60) || (m - lead >= opens && m <= closes);
      });
      if (fits) times.push({ iso: new Date(at).toISOString(), label: clockOf(new Date(at)) });
    }
    if (times.length) days.push({ date: manilaDate(new Date(midnight)), label: dayOf(new Date(midnight), now), times });
  }
  return days;
}
