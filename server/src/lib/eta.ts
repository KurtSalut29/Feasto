/**
 * How long an order takes, in the words of food apps: "Ready by 12:40 PM · arrives about 12:55".
 *
 * - Before the store accepts, Feasto estimates the cooking time from the store's own settings:
 *   its usual time, more for every 5 items after the first 5, plus its busy-kitchen minutes.
 * - When the store accepts, it says how long it will take (the estimate is picked for it), and
 *   that becomes the order's readyBy. If it runs late it says so, and readyBy moves.
 * - The arrival is readyBy (or the moment the rider picked it up) plus the ride: about 3 minutes
 *   per km by motorcycle in town, plus a few minutes to park and hand it over.
 */

/** Minutes per km by motorcycle in Naval, and to park and hand it over */
export const MINUTES_PER_KM = 3;
const HANDOVER_MINUTES = 4;
/** Without a map pin */
const UNKNOWN_RIDE_MINUTES = 12;

export type PrepSettings = { prepMinutes: number; prepPer5Items: number; busyExtraMinutes: number; busyUntil: Date | null };

/** The busy-kitchen minutes in force now (0 once busyUntil has passed) */
export const busyMinutes = (store: Pick<PrepSettings, "busyExtraMinutes" | "busyUntil">, now = new Date()) =>
  store.busyUntil && store.busyUntil > now ? store.busyExtraMinutes : 0;

/** The store's usual cooking time for this many items, with the busy kitchen */
export function prepEstimate(store: PrepSettings, items: number, now = new Date()) {
  const extraSets = Math.ceil(Math.max(0, items - 5) / 5);
  return store.prepMinutes + extraSets * store.prepPer5Items + busyMinutes(store, now);
}

/** The ride from the store to the door */
export const rideMinutes = (km: number | null | undefined) => (km == null ? UNKNOWN_RIDE_MINUTES : Math.round(km * MINUTES_PER_KM + HANDOVER_MINUTES));

/** The times one order should be ready and arrive, from what's known now; null before the store accepts */
export function etaOf(order: {
  status: string;
  fulfillment: "DELIVERY" | "PICKUP";
  readyBy: Date | null;
  readyAt: Date | null;
  pickedUpAt: Date | null;
  deliveryKm: unknown;
}) {
  if (!order.readyBy || !["ACCEPTED", "PREPARING", "READY", "PICKED_UP"].includes(order.status)) return null;
  const km = order.deliveryKm == null ? null : Number(order.deliveryKm);
  const ride = rideMinutes(km) * 60_000;
  const ready = order.readyAt ?? order.readyBy;
  const now = Date.now();
  // Late already: never promise a time that has passed
  const readyBy = new Date(Math.max(ready.getTime(), order.readyAt ? 0 : now));
  const leaves = order.pickedUpAt ?? new Date(Math.max(readyBy.getTime(), now));
  return {
    readyBy: readyBy.toISOString(),
    /** Delivery only */
    arriveBy: order.fulfillment === "DELIVERY" ? new Date(Math.max(leaves.getTime() + ride, now + 60_000)).toISOString() : null,
    late: !order.readyAt && order.readyBy.getTime() < now,
  };
}
