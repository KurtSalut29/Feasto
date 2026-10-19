import express from "express";
import { config } from "./config.js";
import { prisma } from "./lib/db.js";
import { redis } from "./lib/redis.js";

const app = express();
app.use(express.json());

// Every response says which API copy answered it, so load balancing is visible.
app.use((_req, res, next) => {
  res.setHeader("X-Served-By", config.instanceId);
  next();
});

app.get("/api/health", async (_req, res) => {
  const [database, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
  const up = (result: PromiseSettledResult<unknown>) => (result.status === "fulfilled" ? "up" : "down");

  res.json({
    status: "ok",
    instance: config.instanceId,
    database: up(database),
    redis: up(cache),
    time: new Date().toISOString(),
  });
});

const server = app.listen(config.port, () => {
  console.log(`[${config.instanceId}] API listening on port ${config.port}`);
});

async function shutdown() {
  console.log(`[${config.instanceId}] shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
