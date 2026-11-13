import { Router } from "express";
import { z } from "zod";
import { Prisma, type OnlinePayment } from "../generated/prisma/client.js";
import { logActivity, notifyAdmin } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { EARNED, riderBalance, riderBalances, storeBalance, storeBalances, type Balance } from "../lib/earnings.js";
import { HttpError, parseBody } from "../lib/http.js";
import { notify } from "../lib/liveUpdates.js";
import { ONLINE_LABEL, ONLINE_PAYMENTS } from "../lib/payments.js";
import { datesBetween, manilaRange, periodSchema } from "../lib/reportDates.js";
import { getSettings } from "../lib/settings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

const peso = (n: number) => `₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const settlementSelect = {
  id: true,
  amount: true,
  orders: true,
  method: true,
  settledByName: true,
  createdAt: true,
  vendor: { select: { name: true } },
  rider: { select: { name: true } },
} as const;

// ---------- Paying what's owed from cash orders ----------

type Party = { vendorId: string; riderId?: undefined } | { riderId: string; vendorId?: undefined };

/**
 * Records that a store or rider paid Feasto its share of their cash orders: either in the app with
 * an e-wallet or card (simulated), or in person to the admin, who marks it received. One at a
 * time per store or rider, and only for the amount the person saw, so a double click or an order
 * finishing in between can never record the wrong amount or the same money twice.
 */
async function recordPayment(party: Party, expected: number, by: { userId: string; name: string }, method: OnlinePayment | null) {
  const id = party.vendorId ?? party.riderId;
  const who = party.vendorId
    ? await prisma.vendor.findUnique({ where: { id: party.vendorId }, select: { name: true, ownerId: true } })
    : await prisma.user.findFirst({ where: { id: party.riderId, role: "RIDER" }, select: { name: true, id: true } });
  if (!who) throw new HttpError(404, "We couldn't find this store or rider.");

  const settlement = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`settle:${id}`}))) AS locked`;
    const balance = party.vendorId ? await storeBalance(party.vendorId, tx) : await riderBalance(party.riderId!, tx);
    if (balance.owed <= 0) throw new HttpError(409, method ? "There's nothing to pay. Refresh to see the latest." : "There's nothing to collect. Refresh to see the latest.");
    if (Math.abs(balance.owed - expected) > 0.005) {
      throw new HttpError(409, `The amount changed to ${peso(balance.owed)}. Check it, then ${method ? "pay" : "mark it received"} again.`);
    }
    const created = await tx.settlement.create({
      data: { vendorId: party.vendorId ?? null, riderId: party.riderId ?? null, amount: balance.owed, orders: balance.orders, method, settledById: by.userId, settledByName: by.name },
      select: settlementSelect,
    });
    await logActivity(tx, by, {
      category: "EARNINGS",
      action: method ? (party.vendorId ? "Store paid Feasto" : "Rider paid Feasto") : party.vendorId ? "Collected from a store" : "Collected from a rider",
      target: who.name,
      detail: `${peso(balance.owed)}${method ? ` with ${ONLINE_LABEL[method]}` : " in person"} · Feasto's share of ${balance.orders} cash ${balance.orders === 1 ? "order" : "orders"}`,
    });
    return created;
  });

  const amount = peso(Number(settlement.amount));
  const payerId = "ownerId" in who ? who.ownerId : who.id;
  if (method) {
    // The admin sees money arrive without having to do anything
    await notifyAdmin({ title: `${who.name} paid Feasto ${amount}`, body: `With ${ONLINE_LABEL[method]}, for ${settlement.orders} cash ${settlement.orders === 1 ? "order" : "orders"}.`, link: "/admin/earnings" });
  } else {
    await notify(payerId, { title: `Feasto received your ${amount}`, body: "Thank you! What you owe Feasto from cash orders is back to ₱0.", link: party.vendorId ? "/vendor/reports" : "/rider/history" });
  }
  return settlement;
}

const paySchema = z.object({
  method: z.enum(ONLINE_PAYMENTS, "Choose how to pay."),
  /** The amount the page showed */
  expected: z.number(),
});

// ---------- Admin: what Feasto earned, and who still owes whom ----------

export const adminEarningsRouter = Router();
adminEarningsRouter.use(requireAuth, requireRole("ADMIN"));

adminEarningsRouter.get("/earnings", async (req, res) => {
  const { from, to } = parseBody(periodSchema, req.query);
  const range = manilaRange(from, to);
  const where = { createdAt: range, status: { in: [...EARNED] } };
  const [sum, paidOut, daily, byStore, byRider, stores, riders, settlements, trials, settings] = await Promise.all([
    prisma.order.aggregate({ where, _count: true, _sum: { subtotal: true, deliveryFee: true, commission: true, riderCut: true } }),
    // Online orders were split the moment they were delivered: what went to the stores and the riders
    prisma.$queryRaw<{ stores: string | null; riders: string | null; orders: bigint }[]>`
      SELECT sum(o.subtotal - o.commission)::text AS stores, sum(o."deliveryFee" - o."riderCut" + o.tip)::text AS riders, count(*) AS orders
      FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId"
      WHERE o."createdAt" >= ${range.gte} AND o."createdAt" < ${range.lt} AND o.status IN ('DELIVERED', 'COMPLETED') AND c."paymentMethod" = 'ONLINE'`,
    prisma.$queryRaw<{ day: string; orders: bigint; earned: string }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS day, count(*) AS orders, sum(commission + "riderCut")::text AS earned
      FROM "Order" WHERE "createdAt" >= ${range.gte} AND "createdAt" < ${range.lt} AND status IN ('DELIVERED', 'COMPLETED')
      GROUP BY day`,
    prisma.order.groupBy({ by: ["vendorId"], where, _count: true, _sum: { subtotal: true, commission: true } }),
    prisma.order.groupBy({ by: ["riderId"], where: { ...where, riderId: { not: null } }, _count: true, _sum: { deliveryFee: true, riderCut: true, tip: true } }),
    storeBalances(),
    riderBalances(),
    prisma.settlement.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: settlementSelect }),
    prisma.vendor.findMany({ where: { commissionFreeUntil: { gt: new Date() } }, orderBy: { commissionFreeUntil: "asc" }, select: { id: true, name: true, commissionFreeUntil: true } }),
    getSettings(),
  ]);

  // Names for everyone in the lists
  const vendorIds = [...new Set([...byStore.map((s) => s.vendorId), ...stores.map((b) => b.id)])];
  const riderIds = [...new Set([...byRider.map((r) => r.riderId!), ...riders.map((b) => b.id)])];
  const [vendorNames, riderNames] = await Promise.all([
    prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true, imageUrl: true } }),
    prisma.user.findMany({ where: { id: { in: riderIds } }, select: { id: true, name: true } }),
  ]);
  const store = new Map(vendorNames.map((v) => [v.id, v]));
  const rider = new Map(riderNames.map((u) => [u.id, u]));
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const commission = Number(sum._sum.commission ?? 0);
  const riderShare = Number(sum._sum.riderCut ?? 0);
  const sales = Number(sum._sum.subtotal ?? 0);
  const deliveryFees = Number(sum._sum.deliveryFee ?? 0);
  // Only what's still owed, the biggest amounts first
  const open = (list: Balance[]) => list.filter((b) => b.owed > 0).sort((a, b) => b.owed - a.owed);

  res.json({
    from,
    to,
    rates: {
      commissionPercent: settings.commissionPercent,
      pickupCommissionPercent: settings.pickupCommissionPercent,
      riderFeePercent: settings.riderFeePercent,
      freeTrialDays: settings.freeTrialDays,
    },
    totals: {
      earned: Math.round((commission + riderShare) * 100) / 100,
      commission,
      riderShare,
      orders: sum._count,
      sales,
      deliveryFees,
      /** Feasto's share of all the money that went through it */
      takeRate: sales + deliveryFees > 0 ? ((commission + riderShare) / (sales + deliveryFees)) * 100 : 0,
    },
    daily: datesBetween(from, to).map((date) => ({ date, orders: Number(byDay.get(date)?.orders ?? 0), sales: Number(byDay.get(date)?.earned ?? 0) })),
    stores: byStore
      .map((s) => ({ id: s.vendorId, name: store.get(s.vendorId)?.name ?? "Removed store", imageUrl: store.get(s.vendorId)?.imageUrl ?? null, orders: s._count, sales: Number(s._sum.subtotal ?? 0), commission: Number(s._sum.commission ?? 0) }))
      .sort((a, b) => b.commission - a.commission),
    riders: byRider
      .map((r) => ({ id: r.riderId!, name: rider.get(r.riderId!)?.name ?? "Removed rider", deliveries: r._count, fees: Number(r._sum.deliveryFee ?? 0), riderShare: Number(r._sum.riderCut ?? 0), tips: Number(r._sum.tip ?? 0) }))
      .sort((a, b) => b.riderShare - a.riderShare),
    balances: {
      stores: open(stores).map((b) => ({ ...b, name: store.get(b.id)?.name ?? "Removed store", imageUrl: store.get(b.id)?.imageUrl ?? null })),
      riders: open(riders).map((b) => ({ ...b, name: rider.get(b.id)?.name ?? "Removed rider" })),
    },
    paidOut: { stores: Number(paidOut[0]?.stores ?? 0), riders: Number(paidOut[0]?.riders ?? 0), orders: Number(paidOut[0]?.orders ?? 0) },
    settlements,
    freeTrials: trials,
  });
});

const settleSchema = z
  .object({
    vendorId: z.string().optional(),
    riderId: z.string().optional(),
    /** The amount the admin saw. If a cash order finished since, they see the new amount first. */
    expected: z.number(),
  })
  .refine((v) => Boolean(v.vendorId) !== Boolean(v.riderId), "Choose one store or one rider.");

/** The admin received Feasto's share of a store's or rider's cash orders in person, so their balance starts again from ₱0. */
adminEarningsRouter.post("/earnings/settle", async (req, res) => {
  const { vendorId, riderId, expected } = parseBody(settleSchema, req.body);
  const party: Party = vendorId ? { vendorId } : { riderId: riderId! };
  const settlement = await recordPayment(party, expected, { userId: req.session!.userId, name: req.session!.name }, null);
  res.status(201).json({ settlement });
});

// ---------- A store's and a rider's own side ----------

const recent = (where: Prisma.SettlementWhereInput) => prisma.settlement.findMany({ where, orderBy: { createdAt: "desc" }, take: 5, select: settlementSelect });

export const vendorEarningsRouter = Router();
vendorEarningsRouter.use(requireAuth, requireRole("VENDOR"));

vendorEarningsRouter.get("/earnings", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const [settings, vendor, balance, settlements] = await Promise.all([
    getSettings(),
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { commissionFreeUntil: true } }),
    storeBalance(vendorId),
    recent({ vendorId }),
  ]);
  const free = vendor.commissionFreeUntil && vendor.commissionFreeUntil > new Date() ? vendor.commissionFreeUntil : null;
  res.json({ rates: { delivery: settings.commissionPercent, pickup: settings.pickupCommissionPercent }, freeUntil: free, balance, settlements });
});

/** The store pays what it owes Feasto from cash orders, with an e-wallet or card (simulated). */
vendorEarningsRouter.post("/earnings/pay", async (req, res) => {
  const { method, expected } = parseBody(paySchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const settlement = await recordPayment({ vendorId }, expected, { userId: req.session!.userId, name: req.session!.name }, method);
  res.status(201).json({ settlement, method: ONLINE_LABEL[method] });
});

export const riderEarningsRouter = Router();
riderEarningsRouter.use(requireAuth, requireRole("RIDER"));

riderEarningsRouter.get("/earnings", async (req, res) => {
  const riderId = req.session!.userId;
  const [settings, balance, settlements] = await Promise.all([getSettings(), riderBalance(riderId), recent({ riderId })]);
  res.json({ rate: settings.riderFeePercent, balance, settlements });
});

/** The rider pays what they owe Feasto from cash deliveries, with an e-wallet or card (simulated). */
riderEarningsRouter.post("/earnings/pay", async (req, res) => {
  const { method, expected } = parseBody(paySchema, req.body);
  const riderId = req.session!.userId;
  const settlement = await recordPayment({ riderId }, expected, { userId: riderId, name: req.session!.name }, method);
  res.status(201).json({ settlement, method: ONLINE_LABEL[method] });
});
