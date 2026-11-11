import type { Fulfillment } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { broadcastOrder, orderCode, transition } from "./orders.js";
import { enqueue } from "./outbox.js";
import { QUEUES } from "./rabbitmq.js";
import { manilaStartOfDay, manilaTime } from "./storeHours.js";

/**
 * Ordering for later. The resident picks a time (in 15-minute steps, from an hour from now up to
 * two days ahead) and pays as usual. The order waits as SCHEDULED, which the store can see coming,
 * and is sent to the store to accept a while before the time: 45 minutes for a delivery (cooking
 * plus the ride), 30 for a pickup. From then on it's an ordinary order.
 */

export const SLOT_MINUTES = 15;
/** Sooner than this, ordering now is just as quick */
export const MIN_AHEAD_MINUTES = 60;
/** Today and the next two days */
export const SCHEDULE_DAYS = 3;
/** How long before the time the store gets the order to accept */
export const SEND_AHEAD_MINUTES: Record<Fulfillment, number> = { DELIVERY: 45, PICKUP: 30 };

export const sendAt = (scheduledFor: Date, fulfillment: Fulfillment) => new Date(scheduledFor.getTime() - SEND_AHEAD_MINUTES[fulfillment] * 60_000);

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** 525 → "8:45 AM" */
function clock12(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

type Hours = { name: string; opensAt: string; closesAt: string };

/** Why this time doesn't work for these stores, or null when it does. Every store's hours must fit. */
export function scheduleProblem(at: Date, fulfillment: Fulfillment, stores: Hours[], now = new Date()): string | null {
  if (Number.isNaN(at.getTime()) || at.getTime() % (SLOT_MINUTES * 60_000) !== 0) return "Choose one of the times shown.";
  if (at.getTime() < now.getTime() + MIN_AHEAD_MINUTES * 60_000) {
    return `Choose a time at least ${MIN_AHEAD_MINUTES} minutes from now, or order for now.`;
  }
  if (at.getTime() >= manilaStartOfDay(now).getTime() + SCHEDULE_DAYS * 86400_000) return `You can order up to ${SCHEDULE_DAYS - 1} days ahead.`;
  const lead = SEND_AHEAD_MINUTES[fulfillment];
  const time = toMinutes(manilaTime(at));
  for (const store of stores) {
    const opens = toMinutes(store.opensAt);
    const closes = toMinutes(store.closesAt);
    if (opens === 0 && closes >= 24 * 60) continue; // open 24 hours
    // The store has to be open both when it gets the order and at the time itself
    if (time - lead < opens || time > closes) {
      return `${store.name} can have it ${fulfillment === "DELIVERY" ? "delivered" : "ready"} from ${clock12(opens + lead)} to ${clock12(closes)}. Choose a time in between.`;
    }
  }
  return null;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

/** "today at 6:30 PM", "tomorrow at 8:00 AM", "Thu, Nov 14 at 6:30 PM" (Manila time) */
export function whenWords(at: Date, now = new Date()) {
  const days = Math.round((manilaStartOfDay(at).getTime() - manilaStartOfDay(now).getTime()) / 86400_000);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : dayFormat.format(at);
  return `${day} at ${timeFormat.format(at)}`;
}
export const clockWords = (at: Date) => timeFormat.format(at);

/** Tells the store a scheduled order is coming, so they can plan for it. */
export async function announceScheduled(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, scheduledFor: true, fulfillment: true, subtotal: true, vendor: { select: { ownerId: true } }, items: { select: { quantity: true } } },
  });
  if (!order || order.status !== "SCHEDULED" || !order.scheduledFor) return;
  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  await notify(order.vendor.ownerId, {
    title: `Scheduled order ${orderCode(order.id)} for ${whenWords(order.scheduledFor)}`,
    body: `${items} ${items === 1 ? "item" : "items"} · ₱${Number(order.subtotal).toFixed(2)} · ${order.fulfillment === "PICKUP" ? "Pickup" : "Delivery"}. You'll get it to accept at ${clockWords(sendAt(order.scheduledFor, order.fulfillment))}.`,
    link: "/vendor/orders",
  });
  await broadcastOrder(order.id);
}

/**
 * Sends scheduled orders whose time is near to their stores. Every worker runs this; the
 * conditional update in `transition` lets only one of them send each order.
 */
export async function sendDueScheduledOrders(log: (...args: unknown[]) => void) {
  const now = Date.now();
  const due = await prisma.order.findMany({
    where: {
      status: "SCHEDULED",
      OR: (["DELIVERY", "PICKUP"] as const).map((fulfillment) => ({ fulfillment, scheduledFor: { lte: new Date(now + SEND_AHEAD_MINUTES[fulfillment] * 60_000) } })),
    },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });
  let sent = 0;
  for (const { id } of due) {
    try {
      await prisma.$transaction(async (tx) => {
        await transition(tx, id, ["SCHEDULED"], "PLACED", { placedAt: new Date() });
        // From here it goes the way every order does: the store is told and has to accept it
        await enqueue(tx, QUEUES.ordersPlaced, { orderId: id });
      });
      sent++;
      log(`scheduled order ${orderCode(id)} sent to its store`);
    } catch (error) {
      if (error instanceof HttpError) continue; // cancelled meanwhile, or another worker sent it
      throw error;
    }
  }
  return sent;
}
