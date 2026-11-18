import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma, type Role } from "../generated/prisma/client.js";
import { logActivity, notifyAdmin, type Actor } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { notify } from "../lib/liveUpdates.js";
import { orderCode } from "../lib/orders.js";
import { perAccount } from "../lib/rateLimit.js";
import { applySuspension, isUntilLifted, SUSPEND_DAY_CHOICES, SUSPENDED_UNTIL_LIFTED, untilText } from "../lib/userReports.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { UPLOADED_PHOTO } from "./uploads.js";

const REASONS = ["PRANK_ORDER", "NO_SHOW", "RUDE", "UNSAFE_DRIVING", "WRONG_ITEMS", "OFF_APP_PAYMENT", "OTHER"] as const;
const REASON_TEXT: Record<(typeof REASONS)[number], string> = {
  PRANK_ORDER: "Fake or prank order",
  NO_SHOW: "Didn't show up or didn't pay",
  RUDE: "Rude or harassing",
  UNSAFE_DRIVING: "Unsafe driving",
  WRONG_ITEMS: "Wrong or missing items",
  OFF_APP_PAYMENT: "Asked for money outside the app",
  OTHER: "Something else",
};
const ROLE_TEXT: Record<Role, string> = { RESIDENT: "customer", RIDER: "rider", VENDOR: "store", ADMIN: "admin" };

/** What a report is about: exactly one order, Pabili or booking */
const targetSchema = z
  .object({ orderId: z.string().min(1).optional(), errandId: z.string().min(1).optional(), bookingId: z.string().min(1).optional() })
  .refine((t) => [t.orderId, t.errandId, t.bookingId].filter(Boolean).length === 1, "Say which order, Pabili or booking this is about.");
type Target = z.infer<typeof targetSchema>;

type Party = { userId: string; name: string };
/** Who was part of an order, Pabili or booking, by the role they had in it, and what to call it */
async function partiesOf(target: Target): Promise<{ parties: Partial<Record<Role, Party>>; label: string }> {
  if (target.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: target.orderId },
      select: {
        id: true,
        checkout: { select: { resident: { select: { id: true, name: true } } } },
        rider: { select: { id: true, name: true } },
        vendor: { select: { name: true, owner: { select: { id: true } } } },
      },
    });
    if (!order) throw new HttpError(404, "We couldn't find that order.");
    return {
      label: `order ${orderCode(order.id)}`,
      parties: {
        RESIDENT: { userId: order.checkout.resident.id, name: order.checkout.resident.name },
        VENDOR: { userId: order.vendor.owner.id, name: order.vendor.name },
        ...(order.rider && { RIDER: { userId: order.rider.id, name: order.rider.name } }),
      },
    };
  }
  if (target.errandId) {
    const errand = await prisma.errand.findUnique({
      where: { id: target.errandId },
      select: { shopName: true, resident: { select: { id: true, name: true } }, rider: { select: { id: true, name: true } } },
    });
    if (!errand) throw new HttpError(404, "We couldn't find that Pabili.");
    return {
      label: `the Pabili at ${errand.shopName}`,
      parties: {
        RESIDENT: { userId: errand.resident.id, name: errand.resident.name },
        ...(errand.rider && { RIDER: { userId: errand.rider.id, name: errand.rider.name } }),
      },
    };
  }
  const booking = await prisma.booking.findUnique({
    where: { id: target.bookingId! },
    select: { startsAt: true, resident: { select: { id: true, name: true } }, table: { select: { vendor: { select: { name: true, owner: { select: { id: true } } } } } } },
  });
  if (!booking) throw new HttpError(404, "We couldn't find that booking.");
  return {
    label: `a table booking at ${booking.table.vendor.name}`,
    parties: {
      RESIDENT: { userId: booking.resident.id, name: booking.resident.name },
      VENDOR: { userId: booking.table.vendor.owner.id, name: booking.table.vendor.name },
    },
  };
}

// ---------- Everyone: sending a report, and reading a warning ----------

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRole("RESIDENT", "RIDER", "VENDOR"));

const reportSchema = z.object({
  orderId: z.string().min(1).optional(),
  errandId: z.string().min(1).optional(),
  bookingId: z.string().min(1).optional(),
  /** Who's being reported, by the role they had in it */
  reportedRole: z.enum(["RESIDENT", "RIDER", "VENDOR"], "Choose who you're reporting."),
  reason: z.enum(REASONS, "Choose what happened."),
  details: z.string().trim().min(10, "Tell us what happened in a few words (at least 10 letters).").max(600, "600 letters at most."),
  photoUrl: z.string().regex(UPLOADED_PHOTO).optional(),
});

reportsRouter.post("/", perAccount("report", 6, 3600, "You've sent a lot of reports just now."), async (req, res) => {
  const input = parseBody(reportSchema, req.body);
  const target = targetSchema.parse({ orderId: input.orderId, errandId: input.errandId, bookingId: input.bookingId });
  const me = req.session!;
  const { parties, label } = await partiesOf(target);
  // Only someone who was part of it can report, and only someone else in it
  if (parties[me.role]?.userId !== me.userId) throw new HttpError(403, "You can only report people from your own orders, Pabili and bookings.");
  const reported = parties[input.reportedRole];
  if (!reported || reported.userId === me.userId) throw new HttpError(400, `There's no ${ROLE_TEXT[input.reportedRole]} to report on this.`);

  try {
    await prisma.report.create({
      data: {
        reporterId: me.userId,
        reporterRole: me.role,
        reportedId: reported.userId,
        reportedRole: input.reportedRole,
        orderId: target.orderId ?? null,
        errandId: target.errandId ?? null,
        bookingId: target.bookingId ?? null,
        reason: input.reason,
        details: input.details,
        photoUrl: input.photoUrl ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, `You already reported this ${ROLE_TEXT[input.reportedRole]} for ${label}.`);
    throw e;
  }
  await notifyAdmin({
    title: `New report: ${REASON_TEXT[input.reason].toLowerCase()}`,
    body: `${me.name} (${ROLE_TEXT[me.role]}) reported ${reported.name} (${ROLE_TEXT[input.reportedRole]}) about ${label}.`,
    link: "/admin/user-reports",
  });
  res.status(201).json({ ok: true });
});

/** The people this person already reported on an order, Pabili or booking (so the button says "Reported") */
reportsRouter.get("/for", async (req, res) => {
  const target = targetSchema.parse(req.query);
  const reports = await prisma.report.findMany({
    where: { reporterId: req.session!.userId, orderId: target.orderId, errandId: target.errandId, bookingId: target.bookingId },
    select: { reportedRole: true, status: true },
  });
  res.json({ reported: reports });
});

/** A warning to read (shown once, after signing in) and any suspension running now */
reportsRouter.get("/me", async (req, res) => {
  const userId = req.session!.userId;
  const [user, warning] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { suspendedUntil: true } }),
    prisma.report.findFirst({
      where: { reportedId: userId, status: { in: ["WARNED", "SUSPENDED"] }, warningSeenAt: null },
      orderBy: { resolvedAt: "desc" },
      select: { id: true, status: true, reason: true, adminNote: true, resolvedAt: true, suspendedUntil: true },
    }),
  ]);
  const until = user?.suspendedUntil && user.suspendedUntil > new Date() ? user.suspendedUntil : null;
  res.json({
    suspension: until && { until: until.toISOString(), untilLifted: isUntilLifted(until), text: untilText(until) },
    warning: warning && { id: warning.id, kind: warning.status, reason: REASON_TEXT[warning.reason], message: warning.adminNote, at: warning.resolvedAt },
  });
});

reportsRouter.post("/me/:id/seen", async (req, res) => {
  await prisma.report.updateMany({ where: { id: String(req.params.id), reportedId: req.session!.userId, warningSeenAt: null }, data: { warningSeenAt: new Date() } });
  res.json({ ok: true });
});

// ---------- The admin: reading reports and acting on them ----------

export const adminReportsRouter = Router();
adminReportsRouter.use(requireAuth, requireRole("ADMIN"));

const PAGE_SIZE = 20;
const actorOf = (req: Request): Actor => ({ userId: req.session!.userId, name: req.session!.name });
const person = { select: { id: true, name: true, email: true, phone: true, role: true, suspendedUntil: true, disabledAt: true, vendor: { select: { name: true } } } } as const;

adminReportsRouter.get("/user-reports", async (req, res) => {
  const { view, page } = z.object({ view: z.enum(["open", "closed"]).catch("open"), page: z.coerce.number().int().min(1).catch(1) }).parse(req.query);
  const where = view === "open" ? { status: "OPEN" as const } : { status: { not: "OPEN" as const } };
  const [reports, total, open, suspended] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: view === "open" ? { createdAt: "asc" } : { resolvedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reason: true,
        details: true,
        photoUrl: true,
        status: true,
        adminNote: true,
        suspendedUntil: true,
        resolvedAt: true,
        resolvedByName: true,
        createdAt: true,
        reporterRole: true,
        reportedRole: true,
        orderId: true,
        errandId: true,
        bookingId: true,
        reporter: person,
        reported: person,
        order: { select: { id: true, vendor: { select: { name: true } } } },
        errand: { select: { shopName: true } },
        booking: { select: { startsAt: true, table: { select: { vendor: { select: { name: true } } } } } },
      },
    }),
    prisma.report.count({ where }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.user.findMany({
      where: { suspendedUntil: { gt: new Date() } },
      orderBy: { suspendedUntil: "asc" },
      select: { id: true, name: true, role: true, suspendedUntil: true, vendor: { select: { name: true } } },
      take: 50,
    }),
  ]);
  // How often each reported person was reported and warned before, so a pattern shows
  const history = await prisma.report.groupBy({ by: ["reportedId", "status"], where: { reportedId: { in: [...new Set(reports.map((r) => r.reported.id))] } }, _count: true });
  const pastOf = (id: string) => {
    const rows = history.filter((h) => h.reportedId === id);
    const count = (s?: string) => rows.filter((h) => !s || h.status === s).reduce((n, h) => n + h._count, 0);
    return { reports: count(), warnings: count("WARNED"), suspensions: count("SUSPENDED") };
  };
  const shown = (p: (typeof reports)[number]["reported"]) => ({
    id: p.id,
    name: p.vendor?.name ?? p.name,
    owner: p.vendor ? p.name : null,
    email: p.email,
    phone: p.phone,
    role: p.role,
    suspendedUntil: p.suspendedUntil && p.suspendedUntil > new Date() ? p.suspendedUntil : null,
    disabled: p.disabledAt !== null,
  });
  res.json({
    view,
    page,
    pageSize: PAGE_SIZE,
    total,
    open,
    suspendDays: SUSPEND_DAY_CHOICES,
    reports: reports.map(({ reporter, reported, order, errand, booking, ...r }) => ({
      ...r,
      reasonText: REASON_TEXT[r.reason],
      reporter: shown(reporter),
      reported: { ...shown(reported), past: pastOf(reported.id) },
      about: order
        ? { kind: "order", label: `Order ${orderCode(order.id)} · ${order.vendor.name}`, href: `/admin/orders?q=${order.id.slice(-6)}` }
        : errand
          ? { kind: "pabili", label: `Pabili at ${errand.shopName}`, href: null }
          : booking
            ? { kind: "booking", label: `Table booking at ${booking.table.vendor.name}`, href: null }
            : { kind: "gone", label: "The order was removed", href: null },
    })),
    suspended: suspended.map((u) => ({ id: u.id, name: u.vendor?.name ?? u.name, role: u.role, until: u.suspendedUntil, untilLifted: isUntilLifted(u.suspendedUntil!) })),
  });
});

const resolveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss"), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("warn"), note: z.string().trim().min(10, "Write the warning they'll read (at least 10 letters).").max(300) }),
  z.object({
    action: z.literal("suspend"),
    note: z.string().trim().min(10, "Write why, for them to read (at least 10 letters).").max(300),
    /** Days, or null for "until the admin lifts it" */
    days: z.union([z.literal(1), z.literal(3), z.literal(7), z.literal(30), z.null()]),
  }),
]);

adminReportsRouter.post("/user-reports/:id/resolve", async (req, res) => {
  const id = String(req.params.id);
  const input = parseBody(resolveSchema, req.body);
  const report = await prisma.report.findUnique({ where: { id }, select: { reporterId: true, reportedId: true, reportedRole: true, reason: true, reported: { select: { name: true, vendor: { select: { name: true } } } } } });
  if (!report) throw new HttpError(404, "We couldn't find this report.");
  const until = input.action === "suspend" ? (input.days === null ? SUSPENDED_UNTIL_LIFTED : new Date(Date.now() + input.days * 86_400_000)) : null;
  const name = report.reported.vendor?.name ?? report.reported.name;

  await prisma.$transaction(async (tx) => {
    // Only the first admin action counts, even if it's sent twice
    const { count } = await tx.report.updateMany({
      where: { id, status: "OPEN" },
      data: {
        status: input.action === "dismiss" ? "DISMISSED" : input.action === "warn" ? "WARNED" : "SUSPENDED",
        adminNote: input.note || null,
        suspendedUntil: until,
        resolvedAt: new Date(),
        resolvedByName: req.session!.name,
      },
    });
    if (count === 0) throw new HttpError(409, "This report was already handled. Refresh to see what was done.");
    // A longer suspension wins over a shorter one already running
    if (until) await tx.user.updateMany({ where: { id: report.reportedId, OR: [{ suspendedUntil: null }, { suspendedUntil: { lt: until } }] }, data: { suspendedUntil: until } });
    const action = input.action === "dismiss" ? "Dismissed a report" : input.action === "warn" ? "Warned after a report" : `Suspended after a report (${untilText(until!)})`;
    await logActivity(tx, actorOf(req), { category: "ACCOUNTS", action, target: name, detail: REASON_TEXT[report.reason] });
  });

  if (until) await applySuspension(report.reportedId, report.reportedRole);
  if (input.action === "warn") {
    await notify(report.reportedId, { title: "Feasto warned you", body: input.note, link: "/" });
  } else if (input.action === "suspend") {
    await notify(report.reportedId, { title: "Your account is suspended", body: `${input.note} Suspended ${untilText(until!)}.`, link: "/" });
  }
  // The person who reported hears it was looked at, not what was done to the other person
  await notify(report.reporterId, {
    title: "We looked into your report",
    body: input.action === "dismiss" ? "Thanks for telling us. We checked it and didn't find a reason to act this time." : "Thanks for telling us. We checked it and took action.",
    link: "/",
  });
  res.json({ ok: true });
});

/** Ends a suspension early */
adminReportsRouter.post("/users/:id/lift-suspension", async (req, res) => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id }, select: { name: true, role: true, suspendedUntil: true, vendor: { select: { id: true, name: true } } } });
  if (!user?.suspendedUntil) throw new HttpError(409, "This account isn't suspended.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { suspendedUntil: null } });
    await logActivity(tx, actorOf(req), { category: "ACCOUNTS", action: "Lifted a suspension", target: user.vendor?.name ?? user.name });
  });
  if (user.vendor) await applySuspension(id, "VENDOR"); // refreshes the store's cached pages
  await notify(id, { title: "Your suspension was lifted", body: "You can use Feasto as usual again.", link: "/" });
  res.json({ ok: true });
});
