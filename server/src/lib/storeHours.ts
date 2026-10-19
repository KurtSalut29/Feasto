/** Feasto runs on Philippine time, whatever time zone the server is in. */
const manilaClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Current time in Manila as "HH:MM". */
export function manilaTime(now = new Date()) {
  return manilaClock.format(now);
}

/** Open = inside opening hours and not switched to "temporarily closed". */
export function isStoreOpen(store: { opensAt: string; closesAt: string; isTemporarilyClosed: boolean }, now = new Date()) {
  if (store.isTemporarilyClosed) return false;
  const time = manilaTime(now);
  return time >= store.opensAt && time < store.closesAt;
}

/** Flat delivery fee per store in a checkout (pickup is free). */
export const DELIVERY_FEE = 49;

/** Midnight today in Manila (UTC+8, no daylight saving), as a Date. */
export function manilaStartOfDay(now = new Date()) {
  const manila = new Date(now.getTime() + 8 * 3600_000);
  manila.setUTCHours(0, 0, 0, 0);
  return new Date(manila.getTime() - 8 * 3600_000);
}
