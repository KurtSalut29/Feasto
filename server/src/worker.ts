import type { ConsumeMessage } from "amqplib";
import { availableParallelism } from "node:os";
import { config } from "./config.js";
import { runDueDispatches } from "./lib/dispatch.js";
import { prisma } from "./lib/db.js";
import { broadcastOrder, orderCode } from "./lib/orders.js";
import { checkWaitingPayments, confirmPaid, failPayment } from "./lib/paymentFlow.js";
import { ONLINE_LABEL } from "./lib/payments.js";
import { refundInvoice, XenditError } from "./lib/xendit.js";
import { relayOutbox } from "./lib/outbox.js";
import { startHeartbeat } from "./lib/heartbeat.js";
import { runMonitors } from "./lib/monitor.js";
import { autoCancelStaleOrders } from "./lib/autoCancel.js";
import { clockWords, sendDueScheduledOrders } from "./lib/schedule.js";
import { connectQueue, publish, QUEUES, type QueueName } from "./lib/rabbitmq.js";
import { CHANNELS, notify, publish as publishRealtime } from "./lib/liveUpdates.js";
import { marshal, unmarshal } from "./lib/marshalling.js";
import { redis } from "./lib/redis.js";
import { reportKey, reportPartsKey, type ReportPart } from "./lib/reports.js";

// How many messages this worker handles at the same time.
const PARALLEL_JOBS = 5;
let busyJobs = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...args: unknown[]) => console.log(`[${config.instanceId}]`, ...args);

const { connection, channel } = await connectQueue();
await channel.prefetch(PARALLEL_JOBS);

/**
 * Runs `handler` for each message. Up to PARALLEL_JOBS run at once (RabbitMQ's prefetch),
 * so a checkout with three stores has its three orders processed side by side.
 * A message is acknowledged only after it was handled; if the worker crashes first,
 * RabbitMQ gives it to another worker (or this one after restart).
 */
async function consume<T>(queue: QueueName, handler: (payload: T) => Promise<void>) {
  await channel.consume(queue, async (message: ConsumeMessage | null) => {
    if (!message) return;
    busyJobs++;
    try {
      await handler(unmarshal<T>(message.content.toString(), { transport: "rabbitmq", channel: queue, kind: queue, messageId: message.properties.messageId ?? null }));
      channel.ack(message);
    } catch (error) {
      console.error(`[${config.instanceId}] ${queue} failed`, error);
      // Retry once by requeueing; a message that fails again is dropped to avoid an endless loop
      channel.nack(message, false, !message.fields.redelivered);
    } finally {
      busyJobs--;
    }
  });
}

/** Marks a job as done once. Redis SET NX is atomic, so a redelivered message is skipped. */
async function firstTime(key: string) {
  return (await redis.set(`done:${key}`, "1", "EX", 7 * 86400, "NX")) === "OK";
}

// ---------- A sample from the admin's System page: only unmarshalled, to show the trip ----------

await consume<{ orderCode: string; sentBy: string }>(QUEUES.systemSample, async (sample) => {
  log(`sample ${sample.orderCode} from ${sample.sentBy} unmarshalled`);
});

// ---------- Orders: notify the store (one message per store order) ----------

await consume<{ orderId: string }>(QUEUES.ordersPlaced, async ({ orderId }) => {
  const started = Date.now();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { vendor: { select: { ownerId: true, name: true } }, items: { select: { quantity: true } }, checkout: { select: { residentId: true } } },
  });
  if (!order || order.status !== "PLACED") return; // cancelled meanwhile, or not paid
  if (!(await firstTime(`order-placed:${orderId}`))) return;

  // Simulated work (e.g. printing the kitchen ticket). It makes the parallel processing
  // easy to see: three orders finish in about the time of one.
  await sleep(config.orderProcessingDelayMs);

  const items = order.items.reduce((n, i) => n + i.quantity, 0);
  const summary = `${items} ${items === 1 ? "item" : "items"} · ₱${Number(order.subtotal).toFixed(2)} · ${order.fulfillment === "PICKUP" ? "Pickup" : "Delivery"}`;
  // A scheduled order arrives now because its time is near
  const by = order.scheduledFor ? clockWords(order.scheduledFor) : null;
  await notify(order.vendor.ownerId, {
    title: by ? `Scheduled order ${orderCode(order.id)} for ${by}` : `New order ${orderCode(order.id)}`,
    body: by ? `${summary}. Accept it now so it's ${order.fulfillment === "PICKUP" ? "ready" : "delivered"} by ${by}.` : summary,
    link: "/vendor/orders",
  });
  await notify(order.checkout.residentId, {
    title: by ? `Your order for ${by} went to ${order.vendor.name}` : `Order sent to ${order.vendor.name}`,
    body: by ? `They're getting it ready for ${by}. We'll tell you once they accept it.` : "Waiting for the store to accept it.",
    link: `/resident/orders/${order.id}`,
  });
  await broadcastOrder(order.id);
  log(`order ${orderCode(order.id)} for ${order.vendor.name} processed in ${Date.now() - started} ms`);
});

// ---------- Online payment (simulated) and refunds; the saga itself is in lib/paymentFlow.ts ----------

await consume<{ checkoutId: string; simulateFailure: boolean }>(QUEUES.paymentRequested, async ({ checkoutId, simulateFailure }) => {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId }, select: { paymentStatus: true } });
  if (!checkout || checkout.paymentStatus !== "PENDING") return;
  await sleep(config.paymentDelayMs); // talking to the payment provider (simulated)
  if (simulateFailure) await failPayment(checkoutId, "Online payment failed", log);
  else await confirmPaid(checkoutId, null, log);
});

/**
 * Gives back one order's part of an online payment, after it was cancelled or declined. With
 * Xendit the money really goes back to the card or e-wallet (in Test Mode, test money).
 */
await consume<{ orderId: string }>(QUEUES.refundRequested, async ({ orderId }) => {
  if (!(await firstTime(`refund:${orderId}`))) return;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { subtotal: true, deliveryFee: true, vendor: { select: { name: true } }, checkout: { select: { residentId: true, paymentRef: true, paidChannel: true, onlineMethod: true } } },
  });
  if (!order) return;
  const amount = Math.round((Number(order.subtotal) + Number(order.deliveryFee)) * 100) / 100;
  let note = "Simulated refund";
  if (order.checkout.paymentRef && config.payments === "xendit") {
    try {
      const refund = await refundInvoice({ invoiceId: order.checkout.paymentRef, amount, referenceId: orderId, reason: "CANCELLATION" });
      note = `Refunded through Xendit (${refund.id}, ${refund.status.toLowerCase()})`;
    } catch (error) {
      // Not retried automatically: the admin sees why on the order and can refund it by hand
      note = `Refund failed: ${error instanceof XenditError ? error.message : (error as Error).message}`.slice(0, 300);
      log(`refund for ${orderCode(orderId)} failed: ${note}`);
    }
  }
  await prisma.order.update({ where: { id: orderId }, data: { refundNote: note } });
  if (!note.startsWith("Refund failed")) {
    const to = order.checkout.onlineMethod ? ONLINE_LABEL[order.checkout.onlineMethod] : "your card or e-wallet";
    await notify(order.checkout.residentId, { title: `₱${amount.toFixed(2)} refunded`, body: `Your order ${orderCode(orderId)} from ${order.vendor.name} was cancelled, so the money went back to ${to}.`, link: `/resident/orders/${orderId}` });
  }
  log(`refund for ${orderCode(orderId)}: ${note}`);
});

// ---------- Sales reports, map-reduce style ----------

/** Map: split the report into one job per store. */
await consume<{ reportId: string; from: string; to: string }>(QUEUES.reportRequested, async ({ reportId, from, to }) => {
  const stores = await prisma.vendor.findMany({ where: { status: "APPROVED" }, select: { id: true } });
  await redis.hset(reportKey(reportId), { total: stores.length, done: 0, startedAt: Date.now() });
  if (stores.length === 0) {
    await finishReport(reportId);
    return;
  }
  for (const store of stores) publish(channel, QUEUES.reportPart, { reportId, vendorId: store.id, from, to });
  log(`report ${reportId.slice(0, 8)} split into ${stores.length} store jobs`);
});

/** One store's numbers. Several of these run at once, on every worker. */
await consume<{ reportId: string; vendorId: string; from: string; to: string }>(QUEUES.reportPart, async ({ reportId, vendorId, from, to }) => {
  const range = { gte: new Date(`${from}T00:00:00+08:00`), lt: new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400_000) };
  const [vendor, sold, cancelled, dishes] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { name: true } }),
    prisma.order.aggregate({
      where: { vendorId, createdAt: range, status: { in: ["PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP", "DELIVERED", "COMPLETED"] } },
      _count: true,
      _sum: { subtotal: true, deliveryFee: true },
    }),
    prisma.order.count({ where: { vendorId, createdAt: range, status: { in: ["REJECTED", "CANCELLED"] } } }),
    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: { vendorId, createdAt: range, status: { notIn: ["AWAITING_PAYMENT", "REJECTED", "CANCELLED"] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
    }),
  ]);
  await sleep(config.reportPartDelayMs); // simulated heavier work, so the parallel speed-up is visible

  const part: ReportPart = {
    vendorId,
    name: vendor.name,
    orders: sold._count,
    sales: Number(sold._sum.subtotal ?? 0),
    deliveryFees: Number(sold._sum.deliveryFee ?? 0),
    cancelled,
    topDish: dishes[0]?.name ?? null,
    computedBy: config.instanceId,
  };
  await redis.hset(reportPartsKey(reportId), vendorId, marshal(part, { transport: "redis", channel: reportPartsKey(reportId), kind: "report part" }));
  // Reduce: HINCRBY is atomic, so exactly one worker sees the last part arrive and finishes up
  const done = await redis.hincrby(reportKey(reportId), "done", 1);
  const total = Number(await redis.hget(reportKey(reportId), "total"));
  if (done === total) await finishReport(reportId);
});

async function finishReport(reportId: string) {
  const startedAt = Number(await redis.hget(reportKey(reportId), "startedAt")) || Date.now();
  const requestedBy = await redis.hget(reportKey(reportId), "requestedBy");
  await redis.hset(reportKey(reportId), { status: "done", finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAt });
  await redis.expire(reportPartsKey(reportId), 7 * 86400);
  if (requestedBy) await publishRealtime(CHANNELS.user(requestedBy), { type: "report.ready", reportId });
  log(`report ${reportId.slice(0, 8)} done in ${Date.now() - startedAt} ms`);
}

// ---------- Outbox relay ----------

let relaying = false;
const relayTimer = setInterval(async () => {
  if (relaying) return;
  relaying = true;
  try {
    const sent = await relayOutbox(channel);
    if (sent) log(`relayed ${sent} event(s) from the outbox`);
  } catch (error) {
    console.error(`[${config.instanceId}] outbox relay failed`, error);
  } finally {
    relaying = false;
  }
}, 500);

// ---------- Spreading delivery jobs to riders ----------

let dispatching = false;
const dispatchTimer = setInterval(async () => {
  if (dispatching) return;
  dispatching = true;
  try {
    await runDueDispatches(log);
  } catch (error) {
    console.error(`[${config.instanceId}] job dispatch failed`, error);
  } finally {
    dispatching = false;
  }
}, 1000);

// ---------- Scheduled orders sent to their stores when the time is near, and orders nobody took cancelled ----------

let cancelling = false;
const autoCancelTimer = setInterval(async () => {
  if (cancelling) return;
  cancelling = true;
  try {
    await sendDueScheduledOrders(log);
    await autoCancelStaleOrders(log);
  } catch (error) {
    console.error(`[${config.instanceId}] auto-cancel failed`, error);
  } finally {
    cancelling = false;
  }
}, 15_000);

// ---------- Online payments whose result hasn't arrived (a lost webhook, a resident who closed the page) ----------

let checkingPayments = false;
const paymentsTimer = setInterval(async () => {
  if (checkingPayments) return;
  checkingPayments = true;
  try {
    // One worker at a time asks Xendit, so six workers don't send six times the calls
    if ((await redis.set("lock:payments-check", config.instanceId, "EX", 25, "NX")) === "OK") await checkWaitingPayments(log);
  } catch (error) {
    console.error(`[${config.instanceId}] payment check failed`, error);
  } finally {
    checkingPayments = false;
  }
}, 30_000);

// ---------- Expiring documents and stuck orders ----------

let monitoring = false;
async function monitor() {
  if (monitoring) return;
  monitoring = true;
  try {
    await runMonitors(log);
  } catch (error) {
    console.error(`[${config.instanceId}] monitor failed`, error);
  } finally {
    monitoring = false;
  }
}
const monitorTimer = setInterval(monitor, 60_000);
void monitor();

// How many workers were started and on how many CPUs (set by workers.ts), for the System page
const workerCount = Number(process.env.WORKER_COUNT ?? 1);
const cpuCount = Number(process.env.CPU_COUNT ?? availableParallelism());
const stopHeartbeat = startHeartbeat("worker", () => ({ busyJobs, parallelJobs: PARALLEL_JOBS, workerCount, cpuCount }));
log(`worker ready, handling up to ${PARALLEL_JOBS} jobs in parallel`);

async function shutdown() {
  log("shutting down");
  clearInterval(relayTimer);
  clearInterval(dispatchTimer);
  clearInterval(autoCancelTimer);
  clearInterval(monitorTimer);
  clearInterval(paymentsTimer);
  stopHeartbeat();
  await channel.close();
  await connection.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
