import { addDays, dayCount, manilaDate } from "./format";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const real = (d: unknown): d is string => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(d));

/**
 * The report period from the address bar (?from=2026-10-01&to=2026-10-11), made safe: no future days,
 * oldest first, at most a year. Without one it's the last 7 days.
 */
export function periodFromParams(params: Record<string, string | string[] | undefined>, defaultDays = 7) {
  const today = manilaDate();
  let to = real(params.to) && params.to <= today ? params.to : today;
  let from = real(params.from) ? params.from : addDays(to, -(defaultDays - 1));
  if (from > to) [from, to] = [to, from];
  if (from > today) from = today;
  if (dayCount(from, to) > 366) from = addDays(to, -365);
  return { from, to };
}

/** The same number of days just before the period, to compare with ("vs the 7 days before") */
export function previousPeriod({ from, to }: { from: string; to: string }) {
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(dayCount(from, to) - 1)), to: prevTo };
}
