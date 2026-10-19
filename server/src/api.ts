import cookieParser from "cookie-parser";
import express from "express";
import { config } from "./config.js";
import { prisma } from "./lib/db.js";
import { errorHandler } from "./lib/http.js";
import { redis } from "./lib/redis.js";
import { authRouter } from "./routes/auth.js";

const app = express();
// Requests arrive through Nginx; trust it to report the visitor's real IP address.
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());

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

app.use("/api/auth", authRouter);

app.use(errorHandler);

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
