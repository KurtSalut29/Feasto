import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import type { ApprovalStatus, OrderStatus, Prisma, Role } from "../generated/prisma/client.js";
import { markDisabled } from "../lib/accounts.js";
import { invalidateStore } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { readHeartbeats } from "../lib/heartbeat.js";
import { QUEUES } from "../lib/queue.js";
import { CHANNELS, notify, publish } from "../lib/realtime.js";
import { redis } from "../lib/redis.js";
import { readReport, REPORT_LIST, reportKey } from "../lib/reports.js";
import { dailySales } from "../lib/sales.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] as const;

adminRouter.get("/overview", async (_req, res) => {
  // The counts are independent, so they run in parallel instead of one after another
  const [pendingStores, pendingRiders, activeStores, activeRiders, ridersOnline, residents, ordersInProgress] = await Promise.all([
    prisma.vendor.count({ where: { status: "PENDING" } }),
    prisma.riderProfile.count({ where: { status: "PENDING" } }),
    prisma.vendor.count({ where: { status: "APPROVED" } }),
    prisma.riderProfile.count({ where: { status: "APPROVED" } }),
    prisma.riderProfile.count({ where: { status: "APPROVED", isOnline: true, user: { disabledAt: null } } }),
    prisma.user.count({ where: { role: "RESIDENT" } }),
    prisma.order.count({ where: { status: { in: ["PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP"] } } }),
  ]);
  res.json({ pendingStores, pendingRiders, activeStores, activeRiders, ridersOnline, residents, ordersInProgress });
});

// ---------- Approvals ----------

const listQuery = z.object({
  kind: z.enum(["stores", "riders"]).default("stores"),
  status: z.enum(STATUSES).default("PENDING"),
});

adminRouter.get("/approvals", async (req, res) => {
  const { kind, status } = listQuery.parse(req.query);

  const [storeCounts, riderCounts] = await Promise.all([
    prisma.vendor.groupBy({ by: ["status"], _count: true }),
    prisma.riderProfile.groupBy({ by: ["status"], _count: true }),
  ]);
  const toCounts = (rows: { status: ApprovalStatus; _count: number }[]) =>
    Object.fromEntries(STATUSES.map((s) => [s, rows.find((r) => r.status === s)?._count ?? 0]));

  const owner = { select: { name: true, email: true, phone: true } } as const;
  const items =
    kind === "stores"
      ? await prisma.vendor.findMany({
          where: { status },
          orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
          take: 100,
          select: {
            id: true,
            name: true,
            storeType: true,
            address: true,
            acceptsReservations: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
            owner,
          },
        })
      : await prisma.riderProfile.findMany({
          where: { status },
          orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
          take: 100,
          select: {
            id: true,
            vehicleType: true,
            plateNumber: true,
            licenseNumber: true,
            status: true,
            reviewNote: true,
            reviewedAt: true,
            createdAt: true,
            user: owner,
          },
        });

  res.json({ kind, status, counts: { stores: toCounts(storeCounts), riders: toCounts(riderCounts) }, items });
});

/** Which statuses each decision may come from. */
const ALLOWED_FROM: Record<Exclude<ApprovalStatus, "PENDING">, ApprovalStatus[]> = {
  APPROVED: ["PENDING", "REJECTED", "SUSPENDED"], // approve, reconsider, or reinstate
  REJECTED: ["PENDING"],
  SUSPENDED: ["APPROVED"],
};

const reviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.decision === "APPROVED" || (v.note && v.note.length >= 3), {
    path: ["note"],
    message: "Give a short reason so they know what to fix.",
  });

const decisionWords = { APPROVED: "approved", REJECTED: "not approved", SUSPENDED: "suspended" } as const;

adminRouter.post("/stores/:id/review", async (req, res) => {
  const { decision, note } = parseBody(reviewSchema, req.body);
  const id = String(req.params.id);

  // Only change it if it's still in a state this decision may come from. If two admins
  // review the same store at once, the second update matches nothing and is refused.
  const { count } = await prisma.vendor.updateMany({
    where: { id, status: { in: ALLOWED_FROM[decision] } },
    data: { status: decision, reviewNote: decision === "APPROVED" ? null : note, reviewedAt: new Date() },
  });
  if (count === 0) throw new HttpError(409, "This store was already reviewed or changed. Refresh to see its current status.");

  const store = await prisma.vendor.findUniqueOrThrow({ where: { id }, select: { ownerId: true, name: true } });
  await invalidateStore(id);
  await notify(store.ownerId, {
    title: `${store.name} was ${decisionWords[decision]}`,
    body: decision === "APPROVED" ? "Residents can now see your store and order from it." : `Reason: ${note}`,
    link: "/vendor",
  });
  res.json({ ok: true });
});

adminRouter.post("/riders/:id/review", async (req, res) => {
  const { decision, note } = parseBody(reviewSchema, req.body);
  const id = String(req.params.id);

  const { count } = await prisma.riderProfile.updateMany({
    where: { id, status: { in: ALLOWED_FROM[decision] } },
    data: {
      status: decision,
      reviewNote: decision === "APPROVED" ? null : note,
      reviewedAt: new Date(),
      // A suspended rider is taken offline immediately
      ...(decision !== "APPROVED" && { isOnline: false }),
    },
  });
  if (count === 0) throw new HttpError(409, "This rider was already reviewed or changed. Refresh to see their current status.");

  const rider = await prisma.riderProfile.findUniqueOrThrow({ where: { id }, select: { userId: true } });
  await notify(rider.userId, {
    title: `Your rider account was ${decisionWords[decision]}`,
    body: decision === "APPROVED" ? "You can now go online and accept delivery jobs." : `Reason: ${note}`,
    link: "/rider",
  });
  res.json({ ok: true });
});

// ---------- Sales chart ----------

adminRouter.get("/sales", async (req, res) => {
  const { days } = z.object({ days: z.coerce.number().int().min(7).max(90).default(14) }).parse(req.query);
  res.json({ days: await dailySales(days) });
});

// ---------- Users ----------

const usersQuery = z.object({
  role: z.enum(["RESIDENT", "RIDER", "VENDOR", "ADMIN"]).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
const PAGE_SIZE = 25;

adminRouter.get("/users", async (req, res) => {
  const { role, q, page } = usersQuery.parse(req.query);
  const where: Prisma.UserWhereInput = {
    ...(role && { role: role as Role }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
  };

  const [total, users, roleCounts] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        disabledAt: true,
        vendor: { select: { id: true, name: true, status: true } },
        riderProfile: { select: { vehicleType: true, status: true } },
      },
    }),
    prisma.user.groupBy({ by: ["role"], _count: true }),
  ]);

  res.json({
    users,
    page,
    pageSize: PAGE_SIZE,
    total,
    counts: Object.fromEntries(roleCounts.map((r) => [r.role, r._count])),
  });
});

// ---------- All orders ----------

const ORDER_GROUPS = {
  active: ["AWAITING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP"],
  completed: ["DELIVERED", "COMPLETED"],
  cancelled: ["REJECTED", "CANCELLED"],
} as const satisfies Record<string, OrderStatus[]>;

adminRouter.get("/orders", async (req, res) => {
  const { group, q, page } = z
    .object({
      group: z.enum(["all", "active", "completed", "cancelled"]).catch("all"),
      q: z.string().trim().max(60).optional(),
      page: z.coerce.number().int().min(1).catch(1),
    })
    .parse(req.query);
  const where: Prisma.OrderWhereInput = {
    ...(group !== "all" && { status: { in: [...ORDER_GROUPS[group]] } }),
    ...(q && {
      OR: [
        { id: { endsWith: q.replace(/^#/, "").toLowerCase() } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
        { checkout: { resident: { name: { contains: q, mode: "insensitive" } } } },
      ],
    }),
  };
  const [total, orders, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        fulfillment: true,
        subtotal: true,
        deliveryFee: true,
        createdAt: true,
        vendor: { select: { name: true } },
        rider: { select: { name: true } },
        checkout: { select: { paymentMethod: true, paymentStatus: true, resident: { select: { name: true } } } },
      },
    }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (statuses: readonly OrderStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  res.json({
    orders,
    page,
    pageSize: PAGE_SIZE,
    total,
    counts: {
      all: counts.reduce((n, c) => n + c._count, 0),
      active: count(ORDER_GROUPS.active),
      completed: count(ORDER_GROUPS.completed),
      cancelled: count(ORDER_GROUPS.cancelled),
    },
  });
});

// ---------- Sales reports (computed in parallel by the workers) ----------

const reportSchema = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .refine((v) => v.from <= v.to, { path: ["to"], message: "The end date must be after the start date." });

adminRouter.post("/reports", async (req, res) => {
  const { from, to } = parseBody(reportSchema, req.body);
  const id = randomUUID();
  await redis.hset(reportKey(id), {
    status: "running",
    from,
    to,
    requestedAt: new Date().toISOString(),
    requestedBy: req.session!.userId,
    total: 0,
    done: 0,
  });
  await redis.expire(reportKey(id), 7 * 86400);
  await redis.lpush(REPORT_LIST, id);
  await redis.ltrim(REPORT_LIST, 0, 9);
  // Sent through the outbox like every other job, so it's delivered even if RabbitMQ blips
  await prisma.outboxEvent.create({ data: { topic: QUEUES.reportRequested, payload: { reportId: id, from, to } } });
  res.status(202).json({ id });
});

adminRouter.get("/reports", async (_req, res) => {
  const ids = await redis.lrange(REPORT_LIST, 0, 9);
  const reports = (await Promise.all(ids.map(readReport))).filter((r) => r !== null);
  res.json({ reports: reports.map(({ rows: _rows, ...summary }) => summary) });
});

adminRouter.get("/reports/:id", async (req, res) => {
  const report = await readReport(String(req.params.id));
  if (!report) throw new HttpError(404, "Report not found.");
  res.json({ report });
});

// ---------- System monitor ----------

async function queueStats() {
  try {
    const url = new URL(config.rabbitmqUrl);
    const auth = Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64");
    const response = await fetch(`${config.rabbitmqManagementUrl}/api/queues/%2F`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(2000),
    });
    const queues = (await response.json()) as {
      name: string;
      messages: number;
      consumers: number;
      message_stats?: { publish?: number };
    }[];
    return {
      up: true,
      queues: queues.map((q) => ({ name: q.name, waiting: q.messages, consumers: q.consumers, published: q.message_stats?.publish ?? 0 })),
    };
  } catch {
    return { up: false, queues: [] };
  }
}

async function timed<T>(fn: () => Promise<T>) {
  const start = performance.now();
  try {
    const value = await fn();
    return { up: true, ms: Math.round((performance.now() - start) * 10) / 10, value };
  } catch {
    return { up: false, ms: null, value: null };
  }
}

adminRouter.get("/system", async (_req, res) => {
  const [instances, queues, database, cache, outbox] = await Promise.all([
    readHeartbeats(),
    queueStats(),
    timed(
      () =>
        prisma.$queryRaw<{ connections: bigint }[]>`SELECT count(*) AS connections FROM pg_stat_activity WHERE datname = current_database()`,
    ),
    timed(async () => ({
      keys: await redis.dbsize(),
      memory: (await redis.info("memory")).match(/used_memory_human:(\S+)/)?.[1] ?? "?",
    })),
    prisma.outboxEvent.count({ where: { publishedAt: null } }),
  ]);
  res.json({
    servedBy: config.instanceId,
    checkedAt: new Date().toISOString(),
    instances,
    rabbitmq: queues,
    postgres: { up: database.up, ms: database.ms, connections: database.value ? Number(database.value[0].connections) : null },
    redis: { up: cache.up, ms: cache.ms, ...(cache.value ?? {}) },
    outboxWaiting: outbox,
  });
});

// ---------- Disable / enable accounts ----------

const disableSchema = z.object({ disabled: z.boolean() });

/** Blocks or unblocks an account. A disabled user is logged out of every device right away. */
adminRouter.post("/users/:id/status", async (req, res) => {
  const { disabled } = parseBody(disableSchema, req.body);
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true, vendor: { select: { id: true } } } });
  if (!user) throw new HttpError(404, "User not found.");
  if (user.role === "ADMIN") throw new HttpError(400, "Admin accounts can't be disabled.");

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { disabledAt: disabled ? new Date() : null } }),
    // A disabled rider stops receiving jobs
    ...(disabled && user.role === "RIDER" ? [prisma.riderProfile.updateMany({ where: { userId: id }, data: { isOnline: false } })] : []),
  ]);
  await markDisabled(id, disabled);
  // A disabled vendor's store disappears for residents (and comes back when enabled)
  if (user.vendor) await invalidateStore(user.vendor.id);
  // Close their open pages right away instead of waiting for the next click
  if (disabled) await publish(CHANNELS.user(id), { type: "session.ended" });
  res.json({ ok: true });
});
