import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { recordMarshal, recordUnmarshal } from "./marshal.js";
import { publish, type QueueChannel, type QueueName } from "./queue.js";

type Tx = Prisma.TransactionClient;

/**
 * Transactional outbox. Saves an event in the same database transaction as the change
 * it describes, so the change and the event either both happen or neither does.
 */
export async function enqueue(tx: Tx, topic: QueueName, payload: Record<string, unknown>) {
  const event = await tx.outboxEvent.create({ data: { topic, payload: payload as Prisma.InputJsonObject } });
  // Prisma marshals the payload into the JSON column; the event id follows the message to the worker
  recordMarshal(payload, { transport: "outbox", channel: topic, kind: topic, messageId: event.id });
  return event;
}

/**
 * Moves saved events to RabbitMQ. `FOR UPDATE SKIP LOCKED` lets several workers relay
 * at the same time without sending the same event twice: each claims different rows.
 * Returns how many events were sent.
 */
export async function relayOutbox(channel: QueueChannel, batchSize = 100) {
  // Most ticks nothing is waiting, so don't open a transaction just to find that out
  const anyWaiting = await prisma.outboxEvent.findFirst({ where: { publishedAt: null }, select: { id: true } });
  if (!anyWaiting) return 0;

  return prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<{ id: string; topic: QueueName; payload: Record<string, unknown> }[]>`
      SELECT id, topic, payload FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
      ORDER BY "createdAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED`;
    if (events.length === 0) return 0;

    for (const event of events) {
      // Postgres hands the JSON column back as an object (unmarshalled), then it's marshalled again for RabbitMQ
      recordUnmarshal(JSON.stringify(event.payload), { transport: "outbox", channel: event.topic, kind: event.topic, messageId: event.id });
      publish(channel, event.topic, event.payload, event.id);
    }
    await tx.outboxEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { publishedAt: new Date() },
    });
    return events.length;
  });
}
