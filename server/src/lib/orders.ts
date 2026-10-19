import type { OrderStatus, Prisma } from "../generated/prisma/client.js";
import { invalidateStore } from "./cache.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { CHANNELS, notify, publish } from "./realtime.js";

type Tx = Prisma.TransactionClient;

/** Short code shown to people, e.g. "#A1B2C3". */
export const orderCode = (id: string) => `#${id.slice(-6).toUpperCase()}`;

/** Orders still in progress (not finished one way or another). */
export const ACTIVE_STATUSES: OrderStatus[] = ["AWAITING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP"];
export const FINISHED_STATUSES: OrderStatus[] = ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"];

/**
 * Moves an order from one of `from` to `to` in a single conditional UPDATE.
 * If someone else changed it first (e.g. the resident cancels while the store accepts,
 * through different API copies), the WHERE no longer matches and this one is refused.
 */
export async function transition(
  tx: Tx,
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  extra: Prisma.OrderUncheckedUpdateManyInput = {},
  where: Prisma.OrderWhereInput = {},
) {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: { in: from }, ...where },
    data: { status: to, ...extra },
  });
  if (count === 0) throw new HttpError(409, "This order was already updated. Refresh to see its current status.");
}

/** Puts the stock of a cancelled or rejected order back. */
export async function restoreStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { menuItem: { select: { stock: true, vendorId: true } } } });
  for (const item of items) {
    if (item.menuItem.stock === null) continue; // unlimited
    await tx.menuItem.update({ where: { id: item.menuItemId }, data: { stock: { increment: item.quantity } } });
  }
  return items[0]?.menuItem.vendorId;
}

/**
 * Keeps the checkout's payment status in step with its orders:
 * - online and every order cancelled/rejected -> REFUNDED
 * - cash and every remaining order delivered/collected -> PAID
 */
export async function settlePayment(tx: Tx, checkoutId: string) {
  const checkout = await tx.checkout.findUniqueOrThrow({ where: { id: checkoutId }, include: { orders: { select: { status: true } } } });
  const statuses = checkout.orders.map((o) => o.status);
  const dropped = (s: OrderStatus) => s === "CANCELLED" || s === "REJECTED";
  if (checkout.paymentMethod === "ONLINE" && checkout.paymentStatus === "PAID" && statuses.every(dropped)) {
    await tx.checkout.update({ where: { id: checkoutId }, data: { paymentStatus: "REFUNDED" } });
  }
  if (
    checkout.paymentMethod === "COD" &&
    checkout.paymentStatus === "PENDING" &&
    statuses.some((s) => s === "DELIVERED" || s === "COMPLETED") &&
    statuses.every((s) => FINISHED_STATUSES.includes(s))
  ) {
    await tx.checkout.update({ where: { id: checkoutId }, data: { paymentStatus: "PAID" } });
  }
}

/** Everyone who should see an order change live: the resident, the store owner and the rider. */
export async function broadcastOrder(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, riderId: true, fulfillment: true, checkout: { select: { residentId: true } }, vendor: { select: { ownerId: true } } },
  });
  const event = { type: "order.updated" as const, orderId, status: order.status };
  const users = [order.checkout.residentId, order.vendor.ownerId, order.riderId].filter((u): u is string => Boolean(u));
  await Promise.all(users.map((u) => publish(CHANNELS.user(u), event)));
  // Delivery jobs appear/disappear for riders when an order is accepted, picked or cancelled
  if (order.fulfillment === "DELIVERY") await publish(CHANNELS.riders, { type: "jobs.changed" });
}

/** Notification text for the resident when their order moves. */
export async function notifyResident(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      fulfillment: true,
      rejectReason: true,
      vendor: { select: { name: true, address: true } },
      checkout: { select: { residentId: true } },
    },
  });
  const store = order.vendor.name;
  const messages: Partial<Record<OrderStatus, { title: string; body: string }>> = {
    ACCEPTED: { title: `${store} accepted your order`, body: "They'll start preparing it soon." },
    PREPARING: { title: `${store} is preparing your order`, body: "Your food is being cooked." },
    READY:
      order.fulfillment === "PICKUP"
        ? { title: "Ready for pickup!", body: `Collect it at ${store}, ${order.vendor.address}.` }
        : { title: "Your order is ready", body: "Waiting for the rider to pick it up." },
    PICKED_UP: { title: "Your rider is on the way", body: `Your order from ${store} is coming. Track it live.` },
    DELIVERED: { title: "Delivered. Enjoy your meal!", body: `Thanks for ordering from ${store}.` },
    COMPLETED: { title: "Order collected", body: `Thanks for ordering from ${store}.` },
    REJECTED: { title: `${store} couldn't take your order`, body: order.rejectReason ?? "The store declined it." },
  };
  const message = messages[order.status];
  if (message) await notify(order.checkout.residentId, { ...message, link: `/resident/orders/${orderId}` });
}

/** After stock goes back up, residents' cached menus must show it. */
export function refreshStoreCache(vendorId: string | undefined) {
  return vendorId ? invalidateStore(vendorId) : undefined;
}
