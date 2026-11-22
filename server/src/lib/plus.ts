import { Prisma, type OnlinePayment } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { getSettings } from "./settings.js";
import { createInvoice, expireInvoice, getInvoice, PAY_WITHIN_MINUTES, XenditError } from "./xendit.js";

/**
 * Feasto Plus: a month of free deliveries (a set number, each up to a peso amount, on food over a
 * minimum) and members-only vouchers, paid online. Feasto pays the free deliveries, so the rider
 * still gets the whole fee and the store its full price.
 *
 * Joining makes a PENDING month and Xendit's payment page; the month starts only once Xendit says
 * it was paid (the resident's return, the webhook, or the worker's check), never because a button
 * was pressed. A month bought while one is running starts when that one ends.
 */

type Db = Prisma.TransactionClient | typeof prisma;
type Log = (...args: unknown[]) => void;

export const PLUS_EXTERNAL_PREFIX = "feasto-plus-";
const MONTH_MS = 30 * 86400_000;
/** A payment page still open this long is reused instead of making a new one */
const REUSE_FOR_MS = (PAY_WITHIN_MINUTES - 3) * 60_000;

/** The month running now, if any */
export async function activePlus(db: Db, userId: string, at = new Date()) {
  return db.plusMembership.findFirst({
    where: { userId, status: "ACTIVE", startsAt: { lte: at }, endsAt: { gt: at } },
    orderBy: { endsAt: "desc" },
    select: { id: true, startsAt: true, endsAt: true },
  });
}

/** Checkouts in this month that used a Plus free delivery (cancelled ones give it back) */
export async function plusUses(db: Db, userId: string, month: { startsAt: Date | null; endsAt: Date | null }) {
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT o."checkoutId") AS n FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId"
    WHERE k."residentId" = ${userId} AND o.status NOT IN ('CANCELLED', 'REJECTED')
      AND o."placedAt" >= ${month.startsAt} AND o."placedAt" < ${month.endsAt}
      AND o.discounts @> '[{"kind": "PLUS"}]'::jsonb`;
  return Number(row?.n ?? 0);
}

/** One checkout at a time uses a member's free deliveries */
export const lockPlus = (db: Db, userId: string) => db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plus:${userId}`}))`;

/** What a resident's Plus looks like now */
export async function plusFor(userId: string) {
  const settings = await getSettings();
  const [month, next, pending, history] = await Promise.all([
    activePlus(prisma, userId),
    prisma.plusMembership.findFirst({ where: { userId, status: "ACTIVE", startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, select: { startsAt: true, endsAt: true } }),
    prisma.plusMembership.findFirst({ where: { userId, status: "PENDING", createdAt: { gt: new Date(Date.now() - REUSE_FOR_MS) } }, orderBy: { createdAt: "desc" }, select: { id: true, paymentUrl: true } }),
    prisma.plusMembership.findMany({ where: { userId, status: "ACTIVE" }, orderBy: { startsAt: "desc" }, take: 12, select: { startsAt: true, endsAt: true, amount: true, paidChannel: true } }),
  ]);
  const used = month ? await plusUses(prisma, userId, month) : 0;
  return {
    on: settings.plusOn,
    price: settings.plusPrice,
    freeDeliveries: settings.plusFreeDeliveries,
    deliveryMax: settings.plusDeliveryMax,
    minSpend: settings.plusMinSpend,
    member: month ? { startsAt: month.startsAt!.toISOString(), endsAt: month.endsAt!.toISOString(), used, left: Math.max(0, settings.plusFreeDeliveries - used) } : null,
    nextMonth: next ? { startsAt: next.startsAt!.toISOString(), endsAt: next.endsAt!.toISOString() } : null,
    pending: pending?.paymentUrl ? { id: pending.id, paymentUrl: pending.paymentUrl } : null,
    history: history.map((h) => ({ startsAt: h.startsAt?.toISOString() ?? null, endsAt: h.endsAt?.toISOString() ?? null, amount: Number(h.amount), paidChannel: h.paidChannel })),
  };
}

/** Starts a month (or one more): Xendit's page to pay on, or, without Xendit (simulated payments), on at once */
export async function joinPlus(userId: string, email: string, method: OnlinePayment | null, origin: string) {
  const settings = await getSettings();
  if (!settings.plusOn) throw new HttpError(409, "Feasto Plus isn't open to new members right now.");
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, idStatus: true } });
  if (me.role !== "RESIDENT") throw new HttpError(403, "Feasto Plus is for residents.");
  const open = await prisma.plusMembership.findFirst({ where: { userId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  if (open?.paymentUrl && Date.now() - open.createdAt.getTime() < REUSE_FOR_MS && Number(open.amount) === settings.plusPrice) return { id: open.id, paymentUrl: open.paymentUrl };
  if (open) await closePending(open.id);

  const month = await prisma.plusMembership.create({ data: { userId, amount: settings.plusPrice }, select: { id: true } });
  if (config.payments !== "xendit") {
    await activate(month.id, "SIMULATED");
    return { id: month.id, paymentUrl: null };
  }
  try {
    const invoice = await createInvoice({
      externalId: `${PLUS_EXTERNAL_PREFIX}${month.id}`,
      amount: settings.plusPrice,
      description: "Feasto Plus: one month",
      method,
      returnUrl: `${origin}/resident/plus?payment=${month.id}`,
      email: email.endsWith("feasto.com") ? undefined : email,
      items: [{ name: "Feasto Plus (30 days)", quantity: 1, price: settings.plusPrice }],
    });
    await prisma.plusMembership.update({ where: { id: month.id }, data: { paymentRef: invoice.id, paymentUrl: invoice.invoice_url } });
    return { id: month.id, paymentUrl: invoice.invoice_url };
  } catch (error) {
    await prisma.plusMembership.update({ where: { id: month.id }, data: { status: "FAILED" } });
    if (error instanceof XenditError) throw new HttpError(502, "The payment page couldn't be opened. Try again in a minute.");
    throw error;
  }
}

/** Paid: the month starts now, or when the running one ends */
async function activate(id: string, channel: string | null) {
  const done = await prisma.$transaction(async (tx) => {
    const month = await tx.plusMembership.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!month || month.status !== "PENDING") return null;
    await lockPlus(tx, month.userId);
    const last = await tx.plusMembership.findFirst({ where: { userId: month.userId, status: "ACTIVE", endsAt: { gt: new Date() } }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
    const startsAt = last?.endsAt ?? new Date();
    const endsAt = new Date(startsAt.getTime() + MONTH_MS);
    await tx.plusMembership.update({ where: { id }, data: { status: "ACTIVE", startsAt, endsAt, paidChannel: channel } });
    return { userId: month.userId, startsAt, endsAt, later: Boolean(last) };
  });
  if (done) {
    const day = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
    await notify(done.userId, {
      title: done.later ? "Another month of Feasto Plus" : "Welcome to Feasto Plus!",
      body: done.later ? `It starts ${day(done.startsAt)} and runs to ${day(done.endsAt)}.` : `Your free deliveries start now, until ${day(done.endsAt)}.`,
      link: "/resident/plus",
    });
  }
}

/** Asks Xendit how a month's payment went, and starts the month if it was paid */
export async function syncPlus(id: string, log: Log = () => {}) {
  const month = await prisma.plusMembership.findUnique({ where: { id }, select: { status: true, paymentRef: true, createdAt: true } });
  if (!month || month.status !== "PENDING") return month?.status ?? null;
  if (!month.paymentRef) {
    if (Date.now() - month.createdAt.getTime() > 2 * 60_000) await prisma.plusMembership.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
  } else {
    const invoice = await getInvoice(month.paymentRef);
    if (invoice.status === "PAID" || invoice.status === "SETTLED") {
      await activate(id, invoice.payment_channel ?? invoice.payment_method ?? null);
      log(`Feasto Plus month ${id} paid`);
    } else if (invoice.status === "EXPIRED") await prisma.plusMembership.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
  }
  return (await prisma.plusMembership.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
}

/** An older payment page nobody should pay any more; recorded as paid instead if it was */
async function closePending(id: string) {
  const status = config.payments === "xendit" ? await syncPlus(id).catch(() => "PENDING" as const) : "PENDING";
  if (status !== "PENDING") return;
  const month = await prisma.plusMembership.findUnique({ where: { id }, select: { paymentRef: true } });
  try {
    if (month?.paymentRef) await expireInvoice(month.paymentRef);
  } catch (error) {
    if (!(error instanceof XenditError)) throw error;
    if ((await syncPlus(id).catch(() => "PENDING")) !== "PENDING") return;
  }
  await prisma.plusMembership.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
}

/** Months still waiting for Xendit, checked by the worker in case a webhook never came */
export async function checkWaitingPlus(log: Log) {
  if (config.payments !== "xendit") return;
  const waiting = await prisma.plusMembership.findMany({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 20_000) } }, take: 20, select: { id: true } });
  for (const { id } of waiting) await syncPlus(id, log).catch((error) => log(`couldn't check Plus ${id}: ${(error as Error).message}`));
}

/** For Admin › Promos: members now, money in, and what the free deliveries cost */
export async function plusStats() {
  const now = new Date();
  const [members, income, cost] = await Promise.all([
    prisma.plusMembership.findMany({ where: { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } }, distinct: ["userId"], select: { userId: true } }),
    prisma.plusMembership.aggregate({ where: { status: "ACTIVE" }, _sum: { amount: true }, _count: true }),
    prisma.$queryRaw<{ s: string | null; n: bigint }[]>`
      SELECT sum((SELECT sum((l->>'feasto')::numeric) FROM jsonb_array_elements(o.discounts) l WHERE l->>'kind' = 'PLUS'))::text AS s, count(*) AS n
      FROM "Order" o WHERE o.status NOT IN ('CANCELLED', 'REJECTED') AND o.discounts @> '[{"kind": "PLUS"}]'::jsonb`,
  ]);
  return { members: members.length, months: income._count, income: Number(income._sum.amount ?? 0), freeDeliveries: Number(cost[0]?.n ?? 0), freeDeliveryCost: Math.round(Number(cost[0]?.s ?? 0) * 100) / 100 };
}
