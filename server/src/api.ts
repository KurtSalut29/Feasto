import cookieParser from "cookie-parser";
import express from "express";
import { config } from "./config.js";
import { recordUnmarshal } from "./lib/marshalling.js";
import { prisma } from "./lib/db.js";
import { syncDisabledAccounts, syncPasswordChanges } from "./lib/accounts.js";
import { countRequest, startHeartbeat } from "./lib/heartbeat.js";
import { errorHandler } from "./lib/http.js";
import { redis } from "./lib/redis.js";
import { closeSubscriber, liveConnectionCount } from "./lib/liveUpdateStreams.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { bookingsRouter, vendorBookingsRouter } from "./routes/bookings.js";
import { cartRouter } from "./routes/cart.js";
import { chatRouter } from "./routes/chat.js";
import { checkoutRouter } from "./routes/checkout.js";
import { meRouter } from "./routes/me.js";
import { ordersRouter } from "./routes/orders.js";
import { riderRouter } from "./routes/rider.js";
import { storesRouter } from "./routes/stores.js";
import { uploadsRouter } from "./routes/uploads.js";
import { adminToolsRouter } from "./routes/adminTools.js";
import { documentsRouter } from "./routes/documents.js";
import { vendorRidersRouter } from "./routes/vendorRiders.js";
import { vendorRouter } from "./routes/vendor.js";

const app = express();
// Requests arrive through Nginx; trust it to report the visitor's real IP address.
app.set("trust proxy", 1);
// Express unmarshals JSON request bodies; the raw bytes are kept so the System page can show them
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use((req, _res, next) => {
  const raw = (req as { rawBody?: Buffer }).rawBody;
  if (raw?.length) recordUnmarshal(raw.toString("utf8"), { transport: "http", channel: `${req.method} ${req.path}`, kind: "request body" });
  next();
});
app.use(cookieParser());

// Every response says which API copy answered it, so load balancing is visible.
app.use((_req, res, next) => {
  countRequest();
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
app.use("/api/admin", adminRouter);
app.use("/api/admin", adminToolsRouter);
app.use("/api/me", meRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/vendor", vendorRouter);
app.use("/api/vendor", vendorRidersRouter);
app.use("/api/vendor", vendorBookingsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/rider", riderRouter);
app.use("/api/stores", storesRouter);
app.use("/api/cart", cartRouter);
app.use("/api/checkout", checkoutRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/chat", chatRouter);

app.use(errorHandler);

await Promise.all([syncDisabledAccounts(), syncPasswordChanges()]);
const server = app.listen(config.port, () => {
  console.log(`[${config.instanceId}] API listening on port ${config.port}`);
});
const stopHeartbeat = startHeartbeat("api", () => ({ liveConnections: liveConnectionCount() }));

async function shutdown() {
  console.log(`[${config.instanceId}] shutting down`);
  stopHeartbeat();
  server.close();
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), closeSubscriber()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
