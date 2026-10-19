import amqp from "amqplib";
import { config } from "../config.js";

export const QUEUES = {
  /** One message per store order; the worker notifies the store (processed in parallel) */
  ordersPlaced: "orders.placed",
  /** One message per online checkout; the worker charges it (simulated) and runs the saga */
  paymentRequested: "payment.requested",
  /** A sales report request; the worker splits it into one job per store */
  reportRequested: "report.requested",
  /** One store's part of a report, computed by any worker in parallel */
  reportPart: "report.part",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Connects to RabbitMQ, retrying while it is still starting up. */
export async function connectQueue(attempts = 10) {
  for (let attempt = 1; ; attempt++) {
    try {
      const connection = await amqp.connect(config.rabbitmqUrl);
      const channel = await connection.createChannel();
      for (const queue of Object.values(QUEUES)) {
        // durable: the queue survives a RabbitMQ restart
        await channel.assertQueue(queue, { durable: true });
      }
      return { connection, channel };
    } catch (error) {
      if (attempt >= attempts) throw error;
      console.warn(`RabbitMQ not ready (attempt ${attempt}/${attempts}), retrying in 2s`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export type QueueChannel = Awaited<ReturnType<typeof connectQueue>>["channel"];

export function publish(channel: QueueChannel, queue: QueueName, message: unknown) {
  // persistent: the message is written to disk, so it is not lost if RabbitMQ restarts
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}
