import { config } from "./config.js";
import { connectQueue, QUEUES } from "./lib/queue.js";
import { prisma } from "./lib/db.js";

// How many messages this worker handles at the same time.
const PARALLEL_JOBS = 5;

const { connection, channel } = await connectQueue();
await channel.prefetch(PARALLEL_JOBS);

console.log(`[${config.instanceId}] worker ready, handling up to ${PARALLEL_JOBS} jobs in parallel`);

await channel.consume(QUEUES.ordersPlaced, async (message) => {
  if (!message) return;
  try {
    const event = JSON.parse(message.content.toString());
    console.log(`[${config.instanceId}] ${QUEUES.ordersPlaced}`, event);
    channel.ack(message);
  } catch (error) {
    console.error(`[${config.instanceId}] failed to process message`, error);
    // requeue = false: a malformed message would otherwise fail forever
    channel.nack(message, false, false);
  }
});

async function shutdown() {
  console.log(`[${config.instanceId}] shutting down`);
  await channel.close();
  await connection.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
