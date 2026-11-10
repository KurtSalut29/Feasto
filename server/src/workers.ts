import cluster, { type Worker } from "node:cluster";
import os from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Starts one worker per CPU instead of a fixed number: a 4-CPU computer runs worker-1 to
 * worker-4, an 8-CPU one runs eight. They are separate Node processes (node:cluster), so they
 * really run at the same time on different CPUs, and they share the RabbitMQ queues, so jobs
 * spread across all of them. WORKER_COUNT in the environment overrides the automatic count.
 *
 * If a worker crashes, this process starts a new one in its place after a second.
 */

/** CPUs this process may use. Inside Docker it's what Docker Desktop gives the containers. */
const cpuCount = os.availableParallelism();
const fromEnv = Number(process.env.WORKER_COUNT);
const count = Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : cpuCount;

// The same extension as this file: .js when built, .ts when run with tsx in development
const workerFile = fileURLToPath(new URL(`./worker${import.meta.url.endsWith(".ts") ? ".ts" : ".js"}`, import.meta.url));
cluster.setupPrimary({ exec: workerFile });

const names = new Map<number, string>();
let stopping = false;

function start(name: string) {
  const worker: Worker = cluster.fork({ INSTANCE_ID: name, WORKER_COUNT: String(count), CPU_COUNT: String(cpuCount) });
  names.set(worker.id, name);
}

console.log(
  `[workers] ${cpuCount} CPU${cpuCount === 1 ? "" : "s"} available → starting ${count} worker${count === 1 ? "" : "s"}` +
    (count === cpuCount ? " (one per CPU)" : " (set by WORKER_COUNT)"),
);
for (let i = 1; i <= count; i++) start(`worker-${i}`);

cluster.on("exit", (worker, code, signal) => {
  const name = names.get(worker.id) ?? "worker";
  names.delete(worker.id);
  if (stopping) return;
  console.log(`[workers] ${name} stopped (${signal ?? `code ${code}`}); starting it again`);
  setTimeout(() => start(name), 1000);
});

function stopAll() {
  stopping = true;
  console.log("[workers] shutting down every worker");
  for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill("SIGTERM");
  // Each worker closes its connections and exits; leave once they all have
  const check = setInterval(() => {
    if (Object.keys(cluster.workers ?? {}).length === 0) {
      clearInterval(check);
      process.exit(0);
    }
  }, 200);
}

process.on("SIGTERM", stopAll);
process.on("SIGINT", stopAll);
