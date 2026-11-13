import { Router, type Request } from "express";
import { z } from "zod";
import type { ActivityCategory, Prisma } from "../generated/prisma/client.js";
import { logActivity, type Actor } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { availableRider, forgetRiderPosition, OPEN_JOB } from "../lib/dispatch.js";
import { HttpError, parseBody } from "../lib/http.js";
import { stuckOrdersWhere, whyStuck } from "../lib/monitor.js";
import { broadcastOrder, orderCode, refreshStoreCache, restoreStock, settlePayment, transition } from "../lib/orders.js";
import { notify } from "../lib/liveUpdates.js";
import { daysFromToday, EXPIRING_SOON_DAYS, manilaToday, renewalReviewSchema, reviewRenewal } from "../lib/renewals.js";
import { clearSettingsCache, getSettings, settingsSchema, type Settings } from "../lib/settings.js";
import { documentKind } from "../lib/verification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** What the admin uses to run Feasto day to day: documents, stuck orders, the log, and the settings. */
export const adminToolsRouter = Router();
adminToolsRouter.use(requireAuth, requireRole("ADMIN"));

/** At most this many stuck orders are read at once */
const STUCK_LIMIT = 500;
const PAGE_SIZE = 25;
const actorOf = (req: Request): Actor => ({ userId: req.session!.userId, name: req.session!.name });
const documentsQuery = z.object({
  view: z.enum(["renewals", "expired", "expiring"]).catch("renewals"),
  kind: z.enum(["stores", "riders"]).catch("stores"),
  page: z.coerce.number().int().min(1).catch(1),
});

// ---------- Documents: renewals to review and the expiry monitor ----------

/** Renewals the admin reviews: every store's, and free riders'. A store reviews its own riders. */
const ADMIN_RENEWALS: Prisma.DocumentRenewalWhereInput = { status: "PENDING", OR: [{ vendorId: { not: null } }, { rider: { vendorId: null } }] };

/** Working or suspended accounts: applicants who were never approved aren't in the monitor. */
const REVIEWED = { in: ["APPROVED", "SUSPENDED"] } as Prisma.EnumApprovalStatusFilter;

const documentCounts = async () => {
  const today = manilaToday();
  const soon = daysFromToday(EXPIRING_SOON_DAYS);
  const expired = { lt: today };
  const expiring = { gte: today, lte: soon };
  const [renewals, expiredStores, expiredRiders, expiringStores, expiringRiders] = await Promise.all([
    prisma.documentRenewal.count({ where: ADMIN_RENEWALS }),
    prisma.vendor.count({ where: { status: REVIEWED, permitExpiresAt: expired } }),
    prisma.riderProfile.count({ where: { status: REVIEWED, licenseExpiresAt: expired } }),
    prisma.vendor.count({ where: { status: REVIEWED, permitExpiresAt: expiring } }),
    prisma.riderProfile.count({ where: { status: REVIEWED, licenseExpiresAt: expiring } }),
  ]);
  return { renewals, expired: { stores: expiredStores, riders: expiredRiders }, expiring: { stores: expiringStores, riders: expiringRiders } };
};

adminToolsRouter.get("/documents", async (req, res) => {
  const { view, kind, page } = documentsQuery.parse(req.query);
  const counts = await documentCounts();
  const paging = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };

  if (view === "renewals") {
    const rows = await prisma.documentRenewal.findMany({
      where: ADMIN_RENEWALS,
      orderBy: { submittedAt: "asc" },
      ...paging,
      select: {
        id: true,
        number: true,
        expiresAt: true,
        file: true,
        submittedAt: true,
        vendor: { select: { id: true, name: true, permitNumber: true, permitExpiresAt: true, permitFile: true, status: true, owner: { select: { name: true, phone: true } } } },
        rider: { select: { id: true, licenseNumber: true, licenseExpiresAt: true, licenseFile: true, status: true, user: { select: { name: true, phone: true } } } },
      },
    });
    res.json({
      view,
      kind,
      page,
      pageSize: PAGE_SIZE,
      total: counts.renewals,
      counts,
      renewals: rows.map(({ file, vendor, rider, ...renewal }) => ({
        ...renewal,
        document: documentKind(file),
        kind: vendor ? "stores" : "riders",
        ownerId: vendor?.id ?? rider!.id,
        name: vendor?.name ?? rider!.user.name,
        contact: vendor ? vendor.owner : rider!.user,
        status: vendor?.status ?? rider!.status,
        currentNumber: vendor?.permitNumber ?? rider!.licenseNumber,
        currentExpiresAt: vendor?.permitExpiresAt ?? rider!.licenseExpiresAt,
        currentDocument: documentKind(vendor?.permitFile ?? rider!.licenseFile),
      })),
    });
    return;
  }

  const range = view === "expired" ? { lt: manilaToday() } : { gte: manilaToday(), lte: daysFromToday(EXPIRING_SOON_DAYS) };
  const items =
    kind === "stores"
      ? (
          await prisma.vendor.findMany({
            where: { status: REVIEWED, permitExpiresAt: range },
            orderBy: { permitExpiresAt: "asc" },
            ...paging,
            select: {
              id: true,
              name: true,
              status: true,
              permitNumber: true,
              permitExpiresAt: true,
              owner: { select: { name: true, phone: true } },
              renewals: { where: { status: "PENDING" }, select: { id: true } },
            },
          })
        ).map(({ permitNumber, permitExpiresAt, owner, renewals, ...store }) => ({
          ...store,
          number: permitNumber,
          expiresAt: permitExpiresAt,
          contact: owner,
          renewalWaiting: renewals.length > 0,
          storeName: null,
          suspendedByAdmin: false,
        }))
      : (
          await prisma.riderProfile.findMany({
            where: { status: REVIEWED, licenseExpiresAt: range },
            orderBy: { licenseExpiresAt: "asc" },
            ...paging,
            select: {
              id: true,
              status: true,
              licenseNumber: true,
              licenseExpiresAt: true,
              suspendedByAdmin: true,
              user: { select: { name: true, phone: true } },
              vendor: { select: { name: true } },
              renewals: { where: { status: "PENDING" }, select: { id: true } },
            },
          })
        ).map(({ licenseNumber, licenseExpiresAt, user, vendor, renewals, ...rider }) => ({
          ...rider,
          name: user.name,
          number: licenseNumber,
          expiresAt: licenseExpiresAt,
          contact: user,
          renewalWaiting: renewals.length > 0,
          storeName: vendor?.name ?? null,
        }));
  res.json({ view, kind, page, pageSize: PAGE_SIZE, total: counts[view][kind], counts, items });
});

adminToolsRouter.post("/renewals/:id/review", async (req, res) => {
  const input = parseBody(renewalReviewSchema, req.body);
  await reviewRenewal(String(req.params.id), input, { admin: true, actor: actorOf(req) });
  res.json({ ok: true });
});

// ---------- Stuck orders ----------

adminToolsRouter.get("/stuck", async (req, res) => {
  const { page, reason } = z
    .object({
      page: z.coerce.number().int().min(1).catch(1),
      reason: z.enum(["NO_STORE_REPLY", "NO_RIDER", "RIDER_NOT_COLLECTING", "ON_THE_ROAD"]).optional().catch(undefined),
    })
    .parse(req.query);
  const { stuckMinutes } = await getSettings();
  const where = stuckOrdersWhere(stuckMinutes);
  // Why an order is stuck is worked out per order, so the reasons are counted and filtered here.
  // Stuck orders are few (the admin clears them), so reading them all at once stays cheap.
  const [all, ridersOnline] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: STUCK_LIMIT,
      select: {
        id: true,
        status: true,
        fulfillment: true,
        riderId: true,
        dispatch: true,
        subtotal: true,
        deliveryFee: true,
        createdAt: true,
        placedAt: true,
        scheduledFor: true,
        acceptedAt: true,
        readyAt: true,
        pickedUpAt: true,
        vendor: { select: { name: true, businessPhone: true, owner: { select: { phone: true } } } },
        rider: { select: { name: true, phone: true } },
        checkout: { select: { paymentMethod: true, paymentStatus: true, resident: { select: { name: true, phone: true } } } },
      },
    }),
    prisma.riderProfile.count({ where: availableRider({ vendorId: null }) }),
  ]);
  const explained = all.map((order) => {
    const why = whyStuck(order);
    const { businessPhone, owner, name } = order.vendor;
    return { ...order, ...why, code: orderCode(order.id), vendor: { name, phone: businessPhone ?? owner.phone } };
  });
  // Longest wait first: it has waited the most, so it gets handled first
  explained.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
  const counts = { NO_STORE_REPLY: 0, NO_RIDER: 0, RIDER_NOT_COLLECTING: 0, ON_THE_ROAD: 0 };
  for (const order of explained) counts[order.reason as keyof typeof counts] += 1;
  const shown = reason ? explained.filter((o) => o.reason === reason) : explained;

  res.json({
    stuckMinutes,
    ridersOnline,
    page,
    pageSize: PAGE_SIZE,
    total: shown.length,
    counts: { all: explained.length, ...counts },
    orders: shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  });
});

/** Opens a job with no rider to every rider who could take it, and reminds them now. */
adminToolsRouter.post("/stuck/:id/ask-riders", async (req, res) => {
  const id = String(req.params.id);
  const order = await prisma.order.findUnique({ where: { id }, select: { vendorId: true, vendor: { select: { name: true } } } });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");

  const code = orderCode(id);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, riderId: null, fulfillment: "DELIVERY", status: { in: OPEN_JOB } },
      data: { dispatch: "EVERYONE", nextDispatchAt: null },
    });
    if (count === 0) throw new HttpError(409, "A rider took this job, or it's no longer open. Refresh to see the latest.");
    await logActivity(tx, actorOf(req), { category: "ORDERS", action: "Asked every rider to take a job", target: `${code} from ${order.vendor.name}` });
  });

  const riders = await prisma.riderProfile.findMany({
    where: availableRider({ OR: [{ vendorId: null }, { vendorId: order.vendorId }] }),
    select: { userId: true },
  });
  await Promise.all(riders.map((r) => notify(r.userId, { title: "A delivery job needs a rider", body: `Pick up at ${order.vendor.name}.`, link: "/rider" })));
  await broadcastOrder(id);
  res.json({ reached: riders.length });
});

/** Takes a job from a rider who isn't answering, before they've collected the food. */
adminToolsRouter.post("/stuck/:id/release-rider", async (req, res) => {
  const id = String(req.params.id);
  const order = await prisma.order.findUnique({
    where: { id },
    select: { riderId: true, rider: { select: { name: true } }, vendor: { select: { name: true, ownerId: true } }, checkout: { select: { residentId: true } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");
  const { riderId, rider, vendor, checkout } = order;
  if (!riderId) throw new HttpError(409, "This order has no rider now. Refresh to see the latest.");

  const code = orderCode(id);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id, riderId, status: { in: OPEN_JOB } },
      data: { riderId: null, dispatch: "NEW", nextDispatchAt: new Date() },
    });
    if (count === 0) throw new HttpError(409, "The rider already collected this order, so it can't be taken back.");
    // They aren't answering, so new jobs shouldn't go to them either
    await tx.riderProfile.updateMany({ where: { userId: riderId }, data: { isOnline: false } });
    await logActivity(tx, actorOf(req), { category: "ORDERS", action: "Took a job back from a rider", target: `${code} from ${vendor.name}`, detail: `Rider: ${rider?.name}` });
  });

  await forgetRiderPosition(riderId);
  await notify(riderId, { title: `${code} was given to another rider`, body: "The Feasto admin took it back and set you offline. Go online again when you're ready.", link: "/rider" });
  await notify(vendor.ownerId, { title: `Finding a new rider for ${code}`, body: "The first rider wasn't answering.", link: "/vendor/orders" });
  await notify(checkout.residentId, { title: "We're finding you another rider", body: `Your order from ${vendor.name} is still coming.`, link: `/resident/orders/${id}` });
  await broadcastOrder(id);
  res.json({ ok: true });
});

const cancelSchema = z.object({ reason: z.string("Give a short reason.").trim().min(3, "Give a short reason.").max(200, "Keep it under 200 characters.") });

/** Stops an order that can't be finished. Stock returns unless the food already left the store. */
adminToolsRouter.post("/orders/:id/cancel", async (req, res) => {
  const id = String(req.params.id);
  const { reason } = parseBody(cancelSchema, req.body);
  const order = await prisma.order.findUnique({
    where: { id },
    select: { status: true, checkoutId: true, riderId: true, vendor: { select: { name: true, ownerId: true } }, checkout: { select: { residentId: true } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order. It may have been removed.");

  const code = orderCode(id);
  const vendorId = await prisma.$transaction(async (tx) => {
    await transition(tx, id, ["PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP"], "CANCELLED", { finishedAt: new Date(), rejectReason: `Cancelled by Feasto: ${reason}`, nextDispatchAt: null });
    const restored = order.status === "PICKED_UP" ? undefined : await restoreStock(tx, id);
    await settlePayment(tx, order.checkoutId);
    await logActivity(tx, actorOf(req), { category: "ORDERS", action: "Cancelled an order", target: `${code} from ${order.vendor.name}`, detail: reason });
    return restored;
  });

  await refreshStoreCache(vendorId);
  const message = { title: `${code} was cancelled by Feasto`, body: `Reason: ${reason}` };
  await notify(order.checkout.residentId, { ...message, link: `/resident/orders/${id}` });
  await notify(order.vendor.ownerId, { ...message, link: "/vendor/orders" });
  if (order.riderId) await notify(order.riderId, { ...message, link: "/rider" });
  await broadcastOrder(id);
  res.json({ ok: true });
});

// ---------- Activity log ----------

const ACTIVITY_CATEGORIES = ["APPROVALS", "DOCUMENTS", "ACCOUNTS", "ORDERS", "SETTINGS", "EARNINGS"] as const satisfies ActivityCategory[];

adminToolsRouter.get("/activity", async (req, res) => {
  const { category, q, page } = z
    .object({
      category: z.enum(ACTIVITY_CATEGORIES).optional().catch(undefined),
      q: z.string().trim().max(80).optional(),
      page: z.coerce.number().int().min(1).catch(1),
    })
    .parse(req.query);
  const where: Prisma.ActivityLogWhereInput = {
    ...(category && { category }),
    ...(q && {
      OR: [
        { target: { contains: q, mode: "insensitive" } },
        { actorName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { detail: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
  const [total, entries] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, actorName: true, category: true, action: true, target: true, detail: true, createdAt: true },
    }),
  ]);
  res.json({ entries, page, pageSize: PAGE_SIZE, total });
});

// ---------- Settings ----------

adminToolsRouter.get("/settings", async (_req, res) => {
  res.json({ settings: await getSettings() });
});

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const daysInWords = (days: number[]) =>
  days.length === 7 ? "every day" : days.join() === "1,2,3,4,5" ? "weekdays" : days.join() === "0,6" ? "weekends" : days.map((d) => DAY_SHORT[d]).join(", ");

const SETTING_WORDS: { [K in keyof Settings]: { label: string; show: (value: Settings[K]) => string } } = {
  deliveryFee: { label: "Base delivery fee", show: (value) => `₱${value}` },
  deliveryBaseKm: { label: "Km the base fee covers", show: (value) => `${value} km` },
  deliveryPerKm: { label: "Price per extra km", show: (value) => `₱${value}` },
  deliveryPeakFee: { label: "Rush-hour add-on", show: (value) => `₱${value}` },
  peakHours: {
    label: "Rush hours",
    show: (list) => (list.length ? list.map((w) => `${w.name} ${w.from}–${w.to} (${daysInWords(w.days)})`).join(", ") : "none"),
  },
  storeRiderSeconds: { label: "Store riders' turn", show: (value) => `${value} s` },
  riderWaveSeconds: { label: "Time between waves", show: (value) => `${value} s` },
  stuckMinutes: { label: "Stuck after", show: (value) => `${value} min` },
  autoCancelMinutes: { label: "Cancel automatically after", show: (value) => (value ? `${value} min` : "off") },
  signupsPerNetwork: { label: "Sign-ups per network", show: (value) => `${value} per 10 min` },
  commissionPercent: { label: "Commission on delivery orders", show: (value) => `${value}%` },
  pickupCommissionPercent: { label: "Commission on pickup orders", show: (value) => `${value}%` },
  riderFeePercent: { label: "Feasto's share of the delivery fee", show: (value) => `${value}%` },
  freeTrialDays: { label: "Free days for new stores", show: (value) => (value ? `${value} days` : "none") },
};

const show = <K extends keyof Settings>(key: K, value: Settings[K]) => SETTING_WORDS[key].show(value);

adminToolsRouter.put("/settings", async (req, res) => {
  const next = parseBody(settingsSchema, req.body);
  const previous = await getSettings();
  const changes = (Object.keys(next) as (keyof Settings)[]).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(previous[key]));
  if (changes.length > 0) {
    await prisma.$transaction(async (tx) => {
      const row = { ...next, peakHours: next.peakHours as Prisma.InputJsonValue };
      await tx.platformSettings.upsert({ where: { id: 1 }, create: { id: 1, ...row }, update: row });
      await logActivity(tx, actorOf(req), {
        category: "SETTINGS",
        action: "Changed settings",
        target: "Feasto settings",
        detail: changes.map((key) => `${SETTING_WORDS[key].label}: ${show(key, previous[key])} → ${show(key, next[key])}`).join("; "),
      });
    });
    await clearSettingsCache();
  }
  res.json({ settings: next });
});
