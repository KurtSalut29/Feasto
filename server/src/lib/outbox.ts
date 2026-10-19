import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { publish, type QueueChannel, type QueueName } from "./queue.js";

type Tx = Prisma.TransactionClient;

/**
 * Transactional outbox. Saves an event in the same database transaction as the change
 * it describes, so the change and the event either both happen or neither does.
 */
export function enqueue(tx: Tx, topic: QueueName, payload: Record<string, unknown>) {
  return tx.outboxEvent.create({ data: { topic, payload: payload as Prisma.InputJsonObject } });
}

/**
 * Moves saved events to RabbitMQ. `FOR UPDATE SKIP LOCKED` lets several workers relay
 * at the same time without sending the same event twice: each claims different rows.
 * Returns how many events were sent.
 */
export async function relayOutbox(channel: QueueChannel, batchSize = 100) {
  return prisma.$transaction(async (tx) => {
    const events = await tx.$queryRaw<{ id: string; topic: QueueName; payload: Record<string, unknown> }[]>`
      SELECT id, topic, payload FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
      ORDER BY "createdAt"
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED`;
    if (events.length === 0) return 0;

    for (const event of events) publish(channel, event.topic, event.payload);
    await tx.outboxEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { publishedAt: new Date() },
    });
    return events.length;
  });
}
