import type { PayoutChannel, PayoutParty, Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { notifyAdmin } from "./activity.js";
import { prisma } from "./db.js";
import { notify } from "./liveUpdates.js";
import { orderCode } from "./orders.js";
import { enqueue } from "./outbox.js";
import { QUEUES } from "./rabbitmq.js";
import { createPayout, getPayout, XenditError, type XenditPayout } from "./xendit.js";

/**
 * Feasto paying stores and riders their share of online orders.
 *
 * The resident's card or e-wallet payment lands in Feasto's Xendit account. When an order is
 * delivered or collected, Feasto keeps its commission and sends the rest out with Xendit Payouts:
 * the food (minus the commission) to the store, and the delivery fee (minus Feasto's share) to the
 * rider, each to the e-wallet or bank they chose. In Test Mode it's test money, but every step is
 * a real call, and each payout shows on Xendit's dashboard.
 *
 * The steps, all in the database first so nothing is lost if a process stops:
 * 1. The order finishes: a Payout row per party is saved in the same transaction (PENDING), and a
 *    message tells a worker to send it.
 * 2. The worker claims it (PENDING -> SENDING, once, even with six workers) and asks Xendit.
 * 3. Xendit's answer, its webhook, or the worker checking every 30 seconds moves it to SENT or FAILED.
 * A store or rider with no account yet waits in NEEDS_ACCOUNT and is paid as soon as they add one.
 */

type Tx = Prisma.TransactionClient;
type Log = (...args: unknown[]) => void;

export const PAYOUT_LABEL: Record<PayoutChannel, string> = {
  GCASH: "GCash",
  MAYA: "Maya",
  BDO: "BDO",
  BPI: "BPI",
  METROBANK: "Metrobank",
  LANDBANK: "Landbank",
  UNIONBANK: "UnionBank",
  SECURITY_BANK: "Security Bank",
};
export const PAYOUT_CHANNELS = Object.keys(PAYOUT_LABEL) as PayoutChannel[];
export const isWallet = (channel: PayoutChannel) => channel === "GCASH" || channel === "MAYA";

/** "GCash ••4567": enough to recognise the account, never the whole number */
export const accountWords = (channel: PayoutChannel, number: string) => `${PAYOUT_LABEL[channel]} ••${number.slice(-4)}`;

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const centavos = (n: number) => Math.round(n * 100) / 100;

// ---------- 1. An online order finished ----------

/**
 * Saves what to send for each finished order of a paid online checkout, at most once per order
 * and party (the unique index makes a second call a no-op), and queues each new one.
 * Called from settlePayment, in the transaction that finishes the order.
 */
export async function queuePayouts(tx: Tx, checkoutId: string) {
  const orders = await tx.order.findMany({
    where: { checkoutId, status: { in: ["DELIVERED", "COMPLETED"] }, checkout: { paymentMethod: "ONLINE", paymentStatus: "PAID" } },
    select: { id: true, vendorId: true, riderId: true, subtotal: true, commission: true, deliveryFee: true, riderCut: true, fulfillment: true },
  });
  const data: Prisma.PayoutCreateManyInput[] = [];
  for (const o of orders) {
    const store = centavos(Number(o.subtotal) - Number(o.commission));
    const rider = centavos(Number(o.deliveryFee) - Number(o.riderCut));
    if (store > 0) data.push({ orderId: o.id, party: "STORE", vendorId: o.vendorId, amount: store });
    if (o.fulfillment === "DELIVERY" && o.riderId && rider > 0) data.push({ orderId: o.id, party: "RIDER", riderId: o.riderId, amount: rider });
  }
  if (!data.length) return;
  const created = await tx.payout.createManyAndReturn({ data, skipDuplicates: true, select: { id: true } });
  for (const p of created) await enqueue(tx, QUEUES.payoutRequested, { payoutId: p.id });
}

// ---------- 2. A worker sends it ----------

const payoutInclude = {
  order: { select: { id: true } },
  vendor: { select: { name: true, ownerId: true, payoutChannel: true, payoutName: true, payoutNumber: true } },
  rider: { select: { name: true, riderProfile: { select: { payoutChannel: true, payoutName: true, payoutNumber: true } } } },
} as const;
type Loaded = Prisma.PayoutGetPayload<{ include: typeof payoutInclude }>;

const load = (id: string) => prisma.payout.findUnique({ where: { id }, include: payoutInclude });
const ownerOf = (p: Loaded) => (p.party === "STORE" ? p.vendor!.ownerId : p.riderId!);
const nameOf = (p: Loaded) => (p.party === "STORE" ? p.vendor!.name : p.rider!.name);
const accountOf = (p: Loaded) => (p.party === "STORE" ? p.vendor : p.rider?.riderProfile) ?? null;
const pageOf = (party: PayoutParty) => (party === "STORE" ? "/vendor/reports" : "/rider/history");
const settingsOf = (party: PayoutParty) => (party === "STORE" ? "Reports" : "History");

/** Sends a PENDING payout, or parks it until they add an account. Safe to call twice. */
export async function sendPayout(payoutId: string, log: Log) {
  const p = await load(payoutId);
  if (!p || p.status !== "PENDING") return;
  const account = accountOf(p);
  const amount = Number(p.amount);
  if (!account?.payoutChannel || !account.payoutName || !account.payoutNumber) {
    const { count } = await prisma.payout.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "NEEDS_ACCOUNT" } });
    if (count) {
      await notify(ownerOf(p), {
        title: `Add where to send your ${peso(amount)}`,
        body: `Feasto is holding your share of ${orderCode(p.orderId)}. Add your GCash, Maya or bank account in ${settingsOf(p.party)}, under Money sent to you, and it's sent right away.`,
        link: `${pageOf(p.party)}#payout`,
      });
      log(`payout ${p.id.slice(-6)} waits for ${nameOf(p)}'s account`);
    }
    return;
  }
  // Claimed by one worker only; the account is copied so the record stays true if it changes later
  const { count } = await prisma.payout.updateMany({
    where: { id: p.id, status: "PENDING" },
    data: { status: "SENDING", attempts: { increment: 1 }, channel: account.payoutChannel, accountName: account.payoutName, accountNumber: account.payoutNumber, failure: null, xenditId: null },
  });
  if (count) await submit(p.id, log);
}

/**
 * Asks Xendit to send a claimed payout. Called again by the checker if the first call never got an
 * answer: the same idempotency key then returns the payout Xendit already made instead of a second one.
 */
async function submit(payoutId: string, log: Log) {
  const p = await load(payoutId);
  if (!p || p.status !== "SENDING" || p.xenditId || !p.channel || !p.accountName || !p.accountNumber) return;
  if (config.payments !== "xendit") {
    // Simulated payments: nothing really moves, so it's sent at once
    await finish(p, { status: "SUCCEEDED" }, log);
    return;
  }
  try {
    const x = await createPayout({
      referenceId: p.id,
      idempotencyKey: `${p.id}-${p.attempts}`,
      amount: Number(p.amount),
      channel: p.channel,
      accountName: p.accountName,
      accountNumber: p.accountNumber,
      description: `Feasto ${orderCode(p.orderId)}: ${p.party === "STORE" ? "food sales" : "delivery fee"}`,
    });
    await finish(p, x, log);
  } catch (error) {
    // Xendit refused it (a wrong account, low balance...): failed, and can be sent again.
    // A timeout or a Xendit outage stays SENDING; the checker tries again with the same key.
    if (error instanceof XenditError && error.status >= 400 && error.status < 500 && error.status !== 429) {
      await finish(p, { status: "FAILED", failure_code: error.code, message: error.message }, log);
    } else {
      await prisma.payout.updateMany({ where: { id: p.id, status: "SENDING" }, data: { updatedAt: new Date() } });
      log(`payout ${p.id.slice(-6)} will be retried: ${(error as Error).message}`);
    }
  }
}

// ---------- 3. The result ----------

/** Why a payout failed, in words a store owner understands */
function failureWords(code: string | undefined, channel: PayoutChannel | null, message?: string) {
  const where = channel ? PAYOUT_LABEL[channel] : "The bank";
  switch (code) {
    case "INSUFFICIENT_BALANCE":
      return "Feasto's Xendit balance was too low at that moment. Feasto will send it again.";
    case "INVALID_DESTINATION":
    case "INVALID_ACCOUNT_NUMBER":
      return `${where} couldn't find that account number. Check it, then send it again.`;
    case "REJECTED_BY_CHANNEL":
    case "TRANSFER_ERROR":
      return `${where} didn't accept it. Check the account name and number, then send it again.`;
    case "TEMPORARY_TRANSFER_ERROR":
      return `${where} was down for a moment. Send it again in a few minutes.`;
    case "SLS_SENDER":
    case "SLS_RECIPIENT":
      return "Xendit's safety checks stopped it. Contact Feasto.";
    case "REQUEST_FORBIDDEN_ERROR":
      return "Feasto's Xendit account isn't allowed to send payouts yet. Feasto will send it again once it is.";
    case "CHANNEL_NOT_ACTIVATED":
    case "CHANNEL_CODE_NOT_SUPPORTED":
      return `Feasto can't send to ${where} yet. Choose another bank or e-wallet.`;
    default:
      return message ? `Xendit: ${message}`.slice(0, 200) : "Xendit couldn't send it. Send it again.";
  }
}

/** Records what Xendit said about a payout that's SENDING, and tells the people involved once. */
async function finish(p: Loaded, x: Pick<XenditPayout, "status" | "failure_code"> & { id?: string; message?: string }, log: Log) {
  const amount = Number(p.amount);
  const to = p.channel && p.accountNumber ? accountWords(p.channel, p.accountNumber) : "your account";
  if (x.status === "ACCEPTED" || x.status === "REQUESTED") {
    // Still on its way. Touched, so the checker moves on to others before asking again.
    await prisma.payout.updateMany({ where: { id: p.id, status: "SENDING" }, data: { updatedAt: new Date(), ...(x.id && { xenditId: x.id }) } });
    return;
  }
  if (x.status === "SUCCEEDED") {
    const { count } = await prisma.payout.updateMany({ where: { id: p.id, status: "SENDING" }, data: { status: "SENT", sentAt: new Date(), ...(x.id && { xenditId: x.id }) } });
    if (count) {
      await notify(ownerOf(p), {
        title: `${peso(amount)} sent to your ${to}`,
        body: `Your share of ${orderCode(p.orderId)}${config.payments === "xendit" ? ", through Xendit (test money)" : " (simulated)"}.`,
        link: pageOf(p.party),
      });
      log(`payout ${p.id.slice(-6)}: ${peso(amount)} sent to ${nameOf(p)}`);
    }
    return;
  }
  const failure = failureWords(x.failure_code, p.channel, x.message);
  const { count } = await prisma.payout.updateMany({ where: { id: p.id, status: "SENDING" }, data: { status: "FAILED", failure, ...(x.id && { xenditId: x.id }) } });
  if (count) {
    await notify(ownerOf(p), { title: `We couldn't send your ${peso(amount)}`, body: `${orderCode(p.orderId)}: ${failure}`, link: pageOf(p.party) });
    await notifyAdmin({ title: `Payout to ${nameOf(p)} failed`, body: `${peso(amount)} for ${orderCode(p.orderId)}: ${failure}`, link: "/admin/earnings#payouts" });
    log(`payout ${p.id.slice(-6)} failed: ${failure}`);
  }
}

/** Asks Xendit for one payout's latest status (after a webhook, or from the checker). */
export async function syncPayout(payoutId: string, log: Log) {
  const p = await load(payoutId);
  if (!p || p.status !== "SENDING") return p?.status ?? null;
  if (!p.xenditId) {
    await submit(p.id, log);
  } else if (config.payments === "xendit") {
    await finish(p, await getPayout(p.xenditId), log);
  }
  return (await prisma.payout.findUnique({ where: { id: p.id }, select: { status: true } }))?.status ?? null;
}

/**
 * Every 30 seconds, one worker catches up on payouts whose answer hasn't come (no webhook on the
 * LAN, a timeout) and on any PENDING one whose message was lost.
 */
export async function checkPayouts(log: Log) {
  const quiet = new Date(Date.now() - 20_000);
  const waiting = await prisma.payout.findMany({
    where: { status: { in: ["SENDING", "PENDING"] }, updatedAt: { lt: quiet } },
    select: { id: true, status: true },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  for (const w of waiting) {
    try {
      if (w.status === "PENDING") await sendPayout(w.id, log);
      else await syncPayout(w.id, log);
    } catch (error) {
      log(`payout ${w.id.slice(-6)} check failed: ${(error as Error).message}`);
    }
  }
}

// ---------- Sending again ----------

/** A failed payout, or ones waiting for an account, go back in line. Returns how many. */
export async function requeuePayouts(where: Prisma.PayoutWhereInput) {
  return prisma.$transaction(async (tx) => {
    const ready = await tx.payout.findMany({ where: { AND: [where, { status: { in: ["FAILED", "NEEDS_ACCOUNT"] } }] }, select: { id: true } });
    let count = 0;
    for (const p of ready) {
      // Conditional, so two clicks (or the store and the admin at once) queue it once
      const moved = await tx.payout.updateMany({ where: { id: p.id, status: { in: ["FAILED", "NEEDS_ACCOUNT"] } }, data: { status: "PENDING", failure: null } });
      if (moved.count) {
        await enqueue(tx, QUEUES.payoutRequested, { payoutId: p.id });
        count++;
      }
    }
    return count;
  });
}

// ---------- What the store, rider and admin see ----------

export const payoutSelect = {
  id: true,
  orderId: true,
  party: true,
  amount: true,
  status: true,
  channel: true,
  accountNumber: true,
  xenditId: true,
  failure: true,
  sentAt: true,
  createdAt: true,
  vendor: { select: { name: true } },
  rider: { select: { name: true } },
} as const;

type Row = Prisma.PayoutGetPayload<{ select: typeof payoutSelect }>;

/** One payout for the screen: the account masked, and who it's for */
export function payoutView(p: Row) {
  return {
    id: p.id,
    orderId: p.orderId,
    orderCode: orderCode(p.orderId),
    party: p.party,
    to: p.party === "STORE" ? (p.vendor?.name ?? "Store") : (p.rider?.name ?? "Rider"),
    amount: Number(p.amount),
    status: p.status,
    account: p.channel && p.accountNumber ? accountWords(p.channel, p.accountNumber) : null,
    reference: p.xenditId,
    failure: p.failure,
    sentAt: p.sentAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}
export type PayoutView = ReturnType<typeof payoutView>;

/** Totals by status for a store's or rider's payouts (or everyone's) */
export async function payoutTotals(where: Prisma.PayoutWhereInput) {
  const groups = await prisma.payout.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true });
  const of = (s: string) => groups.find((g) => g.status === s);
  const sum = (...s: string[]) => centavos(s.reduce((t, k) => t + Number(of(k)?._sum.amount ?? 0), 0));
  const n = (...s: string[]) => s.reduce((t, k) => t + (of(k)?._count ?? 0), 0);
  return {
    sent: sum("SENT"),
    sentCount: n("SENT"),
    onTheWay: sum("PENDING", "SENDING"),
    onTheWayCount: n("PENDING", "SENDING"),
    held: sum("NEEDS_ACCOUNT"),
    heldCount: n("NEEDS_ACCOUNT"),
    failed: sum("FAILED"),
    failedCount: n("FAILED"),
  };
}
