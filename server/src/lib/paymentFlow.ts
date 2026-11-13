import { config } from "../config.js";
import { prisma } from "./db.js";
import { notify } from "./liveUpdates.js";
import { broadcastOrder, restoreStock, settlePayment } from "./orders.js";
import { enqueue } from "./outbox.js";
import { QUEUES } from "./rabbitmq.js";
import { invalidateStore } from "./redisCache.js";
import { announceScheduled } from "./schedule.js";
import { createInvoice, expireInvoice, getInvoice, PAY_WITHIN_MINUTES, walletOf, XenditError } from "./xendit.js";

/**
 * The online payment saga, the same whether the payment is simulated or real (Xendit):
 *   checkout reserves the stock and makes the orders AWAITING_PAYMENT
 *   -> paid:   the orders go to their stores (or wait for their time, if scheduled)
 *   -> failed: compensating steps undo the checkout: orders cancelled, stock put back
 * Each step only moves a checkout that is still PENDING, so the webhook, the resident's return
 * page and the worker's check can all report the same payment without doing anything twice.
 */

type Log = (...args: unknown[]) => void;

export async function confirmPaid(checkoutId: string, paidChannel: string | null, log: Log = () => {}) {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId }, include: { orders: { select: { id: true, scheduledFor: true } } } });
  if (!checkout || checkout.paymentStatus !== "PENDING") return false;
  const wallet = walletOf(paidChannel);

  const moved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.checkout.updateMany({
      where: { id: checkoutId, paymentStatus: "PENDING" },
      // Keep what the resident really paid with (they may pick another wallet on the payment page)
      data: { paymentStatus: "PAID", paidChannel, ...(wallet && { onlineMethod: wallet }) },
    });
    if (count === 0) return false;
    for (const order of checkout.orders) {
      // An order for later waits for its time; the others go to their stores now
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: "AWAITING_PAYMENT" },
        data: order.scheduledFor ? { status: "SCHEDULED" } : { status: "PLACED", placedAt: new Date() },
      });
      // Next step of the saga: the paid orders now go to their stores
      if (updated.count && !order.scheduledFor) await enqueue(tx, QUEUES.ordersPlaced, { orderId: order.id });
    }
    // If the resident cancelled while paying, the money goes straight back
    await settlePayment(tx, checkoutId);
    return true;
  });
  if (!moved) return false;

  await notify(checkout.residentId, { title: "Payment received", body: `₱${Number(checkout.total).toFixed(2)} paid online.`, link: "/resident/orders" });
  for (const order of checkout.orders) {
    if (order.scheduledFor) await announceScheduled(order.id);
    await broadcastOrder(order.id);
  }
  log(`payment for checkout ${checkoutId} succeeded${paidChannel ? ` (${paidChannel})` : ""}`);
  return true;
}

/** Compensating steps: the payment failed or expired, so undo what checkout did. */
export async function failPayment(checkoutId: string, reason: string, log: Log = () => {}) {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId }, include: { orders: { select: { id: true, vendorId: true } } } });
  if (!checkout || checkout.paymentStatus !== "PENDING") return false;

  const failed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.checkout.updateMany({ where: { id: checkoutId, paymentStatus: "PENDING" }, data: { paymentStatus: "FAILED" } });
    if (count === 0) return false;
    for (const order of checkout.orders) {
      const cancelled = await tx.order.updateMany({
        where: { id: order.id, status: "AWAITING_PAYMENT" },
        data: { status: "CANCELLED", finishedAt: new Date(), rejectReason: reason },
      });
      if (cancelled.count) await restoreStock(tx, order.id); // put the reserved stock back
    }
    return true;
  });
  if (!failed) return false;

  await Promise.all(checkout.orders.map((o) => invalidateStore(o.vendorId)));
  await Promise.all(checkout.orders.map((o) => broadcastOrder(o.id)));
  await notify(checkout.residentId, { title: "Payment not completed", body: `${reason}. Your order was cancelled and you weren't charged. You can try again.`, link: "/resident/orders" });
  log(`payment for checkout ${checkoutId} FAILED (${reason}): orders cancelled and stock restored`);
  return true;
}

// ---------- Xendit ----------

/**
 * Opens the payment page for a new online checkout and saves where it is. If Xendit can't be
 * reached, the checkout is undone at once so the stock isn't held for nothing.
 */
export async function startOnlinePayment(checkoutId: string, origin: string) {
  const checkout = await prisma.checkout.findUniqueOrThrow({
    where: { id: checkoutId },
    select: {
      total: true,
      onlineMethod: true,
      resident: { select: { email: true } },
      orders: { select: { id: true, deliveryFee: true, vendor: { select: { name: true } }, items: { select: { name: true, quantity: true, unitPrice: true } } } },
    },
  });
  const stores = [...new Set(checkout.orders.map((o) => o.vendor.name))];
  const fees = checkout.orders.reduce((n, o) => n + Number(o.deliveryFee), 0);
  try {
    const invoice = await createInvoice({
      checkoutId,
      amount: Number(checkout.total),
      description: `Feasto order from ${stores.join(", ")}`,
      method: checkout.onlineMethod,
      returnUrl: `${origin}/resident/checkout/paying?checkout=${checkoutId}`,
      // Sample accounts' made-up addresses would bounce, so they're left out
      email: checkout.resident.email.endsWith("@sample.feasto.com") ? undefined : checkout.resident.email,
      items: [
        ...checkout.orders.flatMap((o) => o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: Number(i.unitPrice) }))),
        ...(fees > 0 ? [{ name: "Delivery fee", quantity: 1, price: fees }] : []),
      ],
    });
    await prisma.checkout.update({ where: { id: checkoutId }, data: { paymentRef: invoice.id, paymentUrl: invoice.invoice_url } });
    return invoice.invoice_url;
  } catch (error) {
    console.error(`[${config.instanceId}] Xendit invoice for ${checkoutId} failed`, error);
    await failPayment(checkoutId, "We couldn't reach the payment service");
    return null;
  }
}

/**
 * Asks Xendit how a checkout's payment went and moves the saga on. Safe to call any number of
 * times, from the webhook, the resident's return page and the worker's regular check.
 */
export async function syncPayment(checkoutId: string, log: Log = () => {}) {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId }, select: { paymentStatus: true, paymentRef: true, createdAt: true } });
  if (!checkout || checkout.paymentStatus !== "PENDING") return checkout?.paymentStatus ?? null;
  if (!checkout.paymentRef) {
    // The payment page was never made (Xendit was down mid-checkout): give up after a while
    if (Date.now() - checkout.createdAt.getTime() > 2 * 60_000) await failPayment(checkoutId, "The payment page couldn't be opened", log);
    return (await prisma.checkout.findUnique({ where: { id: checkoutId }, select: { paymentStatus: true } }))?.paymentStatus ?? null;
  }
  const invoice = await getInvoice(checkout.paymentRef);
  if (invoice.status === "PAID" || invoice.status === "SETTLED") await confirmPaid(checkoutId, invoice.payment_channel ?? invoice.payment_method ?? null, log);
  else if (invoice.status === "EXPIRED") await failPayment(checkoutId, `The payment wasn't finished within ${PAY_WITHIN_MINUTES} minutes`, log);
  return (await prisma.checkout.findUnique({ where: { id: checkoutId }, select: { paymentStatus: true } }))?.paymentStatus ?? null;
}

/** The resident cancelled every order before paying: close the payment page so it can't be paid. */
export async function closeUnpaidPage(checkoutId: string) {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId }, select: { paymentRef: true, paymentStatus: true, orders: { select: { status: true } } } });
  if (!checkout?.paymentRef || checkout.paymentStatus !== "PENDING" || !checkout.orders.every((o) => o.status === "CANCELLED")) return;
  try {
    await expireInvoice(checkout.paymentRef);
    await prisma.checkout.updateMany({ where: { id: checkoutId, paymentStatus: "PENDING" }, data: { paymentStatus: "FAILED" } });
  } catch (error) {
    // Already paid or expired: the regular check sorts it out (a payment that slipped through is refunded)
    if (!(error instanceof XenditError)) throw error;
  }
}

/** Online checkouts still waiting for their payment, checked by the worker in case a webhook never came. */
export async function checkWaitingPayments(log: Log) {
  if (config.payments !== "xendit") return;
  const waiting = await prisma.checkout.findMany({
    where: { paymentMethod: "ONLINE", paymentStatus: "PENDING", createdAt: { lt: new Date(Date.now() - 20_000) } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true },
  });
  for (const { id } of waiting) {
    try {
      await syncPayment(id, log);
    } catch (error) {
      log(`couldn't check the payment of ${id}: ${(error as Error).message}`);
    }
  }
}
