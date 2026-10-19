import type { ConsumeMessage } from "amqplib";
import { config } from "./config.js";
import { invalidateStore } from "./lib/cache.js";
import { prisma } from "./lib/db.js";
import { broadcastOrder, orderCode, restoreStock, settlePayment } from "./lib/orders.js";
import { enqueue, relayOutbox } from "./lib/outbox.js";
import { startHeartbeat } from "./lib/heartbeat.js";
import { connectQueue, publish, QUEUES, type QueueName } from "./lib/queue.js";
import { CHANNELS, notify, publish as publishRealtime } from "./lib/realtime.js";
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
      await handler(JSON.parse(message.content.toString()) as T);
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
  await notify(order.vendor.ownerId, {
    title: `New order ${orderCode(order.id)}`,
    body: `${items} ${items === 1 ? "item" : "items"} · ₱${Number(order.subtotal).toFixed(2)} · ${order.fulfillment === "PICKUP" ? "Pickup" : "Delivery"}`,
    link: "/vendor/orders",
  });
  await notify(order.checkout.residentId, {
    title: `Order sent to ${order.vendor.name}`,
    body: "Waiting for the store to accept it.",
    link: `/resident/orders/${order.id}`,
  });
  await broadcastOrder(order.id);
  log(`order ${orderCode(order.id)} for ${order.vendor.name} processed in ${Date.now() - started} ms`);
});

// ---------- Online payment (simulated) and its saga ----------

await consume<{ checkoutId: string; simulateFailure: boolean }>(QUEUES.paymentRequested, async ({ checkoutId, simulateFailure }) => {
  const checkout = await prisma.checkout.findUnique({ where: { id: checkoutId }, include: { orders: { select: { id: true, vendorId: true } } } });
  if (!checkout || checkout.paymentStatus !== "PENDING") return;

  await sleep(config.paymentDelayMs); // talking to the payment provider (simulated)

  if (!simulateFailure) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.checkout.updateMany({ where: { id: checkoutId, paymentStatus: "PENDING" }, data: { paymentStatus: "PAID" } });
      if (count === 0) return;
      for (const order of checkout.orders) {
        const moved = await tx.order.updateMany({ where: { id: order.id, status: "AWAITING_PAYMENT" }, data: { status: "PLACED" } });
        // Next step of the saga: the paid orders now go to their stores
        if (moved.count) await enqueue(tx, QUEUES.ordersPlaced, { orderId: order.id });
      }
      // If the resident cancelled while paying, the money goes straight back
      await settlePayment(tx, checkoutId);
    });
    await notify(checkout.residentId, { title: "Payment received", body: `₱${Number(checkout.total).toFixed(2)} paid online.`, link: "/resident/orders" });
    log(`payment for checkout ${checkoutId} succeeded`);
    return;
  }

  // Compensating steps: the payment failed, so undo what checkout did.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.checkout.updateMany({ where: { id: checkoutId, paymentStatus: "PENDING" }, data: { paymentStatus: "FAILED" } });
    if (count === 0) return;
    for (const order of checkout.orders) {
      const cancelled = await tx.order.updateMany({
        where: { id: order.id, status: "AWAITING_PAYMENT" },
        data: { status: "CANCELLED", finishedAt: new Date(), rejectReason: "Online payment failed" },
      });
      if (cancelled.count) await restoreStock(tx, order.id); // put the reserved stock back
    }
  });
  await Promise.all(checkout.orders.map((o) => invalidateStore(o.vendorId)));
  await Promise.all(checkout.orders.map((o) => broadcastOrder(o.id)));
  await notify(checkout.residentId, {
    title: "Payment failed",
    body: "Your order was cancelled and you weren't charged. You can try again.",
    link: "/resident/orders",
  });
  log(`payment for checkout ${checkoutId} FAILED: orders cancelled and stock restored`);
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
  await redis.hset(reportPartsKey(reportId), vendorId, JSON.stringify(part));
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

const stopHeartbeat = startHeartbeat("worker", () => ({ busyJobs, parallelJobs: PARALLEL_JOBS }));
log(`worker ready, handling up to ${PARALLEL_JOBS} jobs in parallel`);

async function shutdown() {
  log("shutting down");
  clearInterval(relayTimer);
  stopHeartbeat();
  await channel.close();
  await connection.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
