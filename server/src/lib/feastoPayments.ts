import type { OnlinePayment, PaymentStatus } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { logActivity, notifyAdmin } from "./activity.js";
import { prisma } from "./db.js";
import { riderBalance, storeBalance } from "./earnings.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { ONLINE_LABEL } from "./payments.js";
import { createInvoice, expireInvoice, getInvoice, PAY_WITHIN_MINUTES, walletOf, XenditError } from "./xendit.js";

/**
 * A store or rider paying Feasto its share of their cash orders, for real, on Xendit's payment page
 * (test mode: no real money moves). Why it's safe:
 *   - Nobody types where the money goes. The invoice is made by Feasto's own Xendit account, so it
 *     can only pay Feasto.
 *   - It's only counted once Xendit says it was paid (webhook, the payer's return, or the worker's
 *     check), never because a button was pressed or a screenshot was sent.
 *   - The amount comes from the server, and a change in between (a cash order finished) is shown
 *     before anyone pays.
 */

export type Party = { vendorId: string; riderId?: undefined } | { riderId: string; vendorId?: undefined };
type Log = (...args: unknown[]) => void;

const peso = (n: number) => `₱${Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, store: boolean) => `${n} cash ${store ? (n === 1 ? "order" : "orders") : n === 1 ? "delivery" : "deliveries"}`;

/** Xendit's external id for a payment to Feasto, so the webhook can tell it from a resident's checkout */
export const EXTERNAL_PREFIX = "feasto-pay-";

const partyWhere = (party: Party) => (party.vendorId ? { vendorId: party.vendorId } : { riderId: party.riderId! });
const lockKey = (party: Party) => `settle:${party.vendorId ?? party.riderId}`;
const balanceOf = (party: Party, tx: Parameters<typeof storeBalance>[1]) => (party.vendorId ? storeBalance(party.vendorId, tx) : riderBalance(party.riderId!, tx));

/** A payment page still open this long is reused instead of making a new one (it lasts 15 minutes) */
const REUSE_FOR_MS = (PAY_WITHIN_MINUTES - 3) * 60_000;

/**
 * Opens (or reopens) Xendit's payment page for what the store or rider owes now, and returns its
 * link. `returnTo` is the page Xendit sends them back to.
 */
export async function startFeastoPayment(party: Party, expected: number, by: { userId: string; name: string }, method: OnlinePayment, returnTo: string) {
  // Close older pages first, so a page left open for an old amount can't be paid as well
  const open = await prisma.feastoPayment.findMany({ where: { ...partyWhere(party), status: "PENDING" }, orderBy: { createdAt: "desc" } });
  let reuse: (typeof open)[number] | undefined;
  for (const payment of open) {
    const fresh = payment.invoiceUrl && Date.now() - payment.createdAt.getTime() < REUSE_FOR_MS;
    if (!reuse && fresh && payment.method === method && Math.abs(Number(payment.amount) - expected) < 0.005) {
      reuse = payment;
      continue;
    }
    await closePayment(payment.id, "Replaced by a newer payment");
  }

  const prepared = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey(party)}))) AS locked`;
    const balance = await balanceOf(party, tx);
    if (balance.owed <= 0) throw new HttpError(409, "There's nothing to pay. Refresh to see the latest.");
    if (Math.abs(balance.owed - expected) > 0.005) throw new HttpError(409, `The amount changed to ${peso(balance.owed)}. Check it, then pay again.`);
    if (reuse) return { id: reuse.id, url: reuse.invoiceUrl, amount: balance.owed, orders: balance.orders };
    // A second tap while the first is still opening Xendit's page
    const opening = await tx.feastoPayment.findFirst({ where: { ...partyWhere(party), status: "PENDING", invoiceId: null } });
    if (opening) throw new HttpError(409, "Your payment page is opening. Wait a moment, then try again.");
    const created = await tx.feastoPayment.create({
      data: { ...partyWhere(party), amount: balance.owed, orders: balance.orders, method, paidById: by.userId, paidByName: by.name },
      select: { id: true },
    });
    return { id: created.id, url: null, amount: balance.owed, orders: balance.orders };
  });
  if (prepared.url) return { id: prepared.id, url: prepared.url };

  const store = Boolean(party.vendorId);
  try {
    const invoice = await createInvoice({
      externalId: `${EXTERNAL_PREFIX}${prepared.id}`,
      amount: prepared.amount,
      description: `Feasto's share of ${plural(prepared.orders, store)} · ${by.name}`,
      method,
      returnUrl: `${returnTo}?feasto-payment=${prepared.id}`,
      items: [{ name: store ? "Feasto commission on cash orders" : "Feasto's share of cash delivery fees", quantity: 1, price: prepared.amount }],
    });
    await prisma.feastoPayment.update({ where: { id: prepared.id }, data: { invoiceId: invoice.id, invoiceUrl: invoice.invoice_url } });
    return { id: prepared.id, url: invoice.invoice_url };
  } catch (error) {
    console.error(`[${config.instanceId}] Xendit invoice for Feasto payment ${prepared.id} failed`, error);
    await prisma.feastoPayment.updateMany({ where: { id: prepared.id, status: "PENDING" }, data: { status: "FAILED", failure: "We couldn't reach the payment service" } });
    throw new HttpError(502, "We couldn't open the payment page. Check your connection, then try again.");
  }
}

/** Xendit confirmed the money arrived: it becomes a settlement and the balance goes down by what was paid. */
async function confirmPaid(id: string, channel: string | null, log: Log) {
  const payment = await prisma.feastoPayment.findUnique({ where: { id }, include: { vendor: { select: { name: true, ownerId: true } }, rider: { select: { name: true } } } });
  if (!payment || payment.status !== "PENDING") return false;
  const party: Party = payment.vendorId ? { vendorId: payment.vendorId } : { riderId: payment.riderId! };
  const store = Boolean(payment.vendorId);
  const method = walletOf(channel) ?? payment.method; // what they really picked on Xendit's page
  const amount = Number(payment.amount);

  const done = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey(party)}))) AS locked`;
    const { count } = await tx.feastoPayment.updateMany({ where: { id, status: "PENDING" }, data: { status: "PAID", paidChannel: channel, method } });
    if (count === 0) return false;
    const settlement = await tx.settlement.create({
      data: { ...partyWhere(party), amount: payment.amount, orders: payment.orders, method, settledById: payment.paidById, settledByName: payment.paidByName },
      select: { id: true },
    });
    await tx.feastoPayment.update({ where: { id }, data: { settlementId: settlement.id } });
    await logActivity(
      tx,
      { userId: payment.paidById, name: payment.paidByName },
      {
        category: "EARNINGS",
        action: store ? "Store paid Feasto" : "Rider paid Feasto",
        target: payment.vendor?.name ?? payment.rider?.name ?? payment.paidByName,
        detail: `${peso(amount)} with ${ONLINE_LABEL[method]} through Xendit · Feasto's share of ${plural(payment.orders, store)}`,
      },
    );
    return true;
  });
  if (!done) return false;

  const name = payment.vendor?.name ?? payment.rider?.name ?? payment.paidByName;
  await notifyAdmin({ title: `${name} paid Feasto ${peso(amount)}`, body: `With ${ONLINE_LABEL[method]} through Xendit, for ${plural(payment.orders, store)}.`, link: "/admin/earnings" });
  await notify(payment.vendor?.ownerId ?? payment.riderId!, {
    title: `Feasto received your ${peso(amount)}`,
    body: `Paid with ${ONLINE_LABEL[method]}. Salamat!`,
    link: store ? "/vendor/reports" : "/rider/history",
  });
  log(`Feasto payment ${id} succeeded (${channel ?? method})`);
  return true;
}

async function failPayment(id: string, reason: string, log: Log) {
  const { count } = await prisma.feastoPayment.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED", failure: reason } });
  if (count) log(`Feasto payment ${id} FAILED (${reason})`);
  return count > 0;
}

/**
 * Asks Xendit how a payment to Feasto went and records the result. Safe to call any number of
 * times, from the webhook, the payer's return page and the worker's regular check.
 */
export async function syncFeastoPayment(id: string, log: Log = () => {}): Promise<PaymentStatus | null> {
  const payment = await prisma.feastoPayment.findUnique({ where: { id }, select: { status: true, invoiceId: true, createdAt: true } });
  if (!payment || payment.status !== "PENDING") return payment?.status ?? null;
  if (!payment.invoiceId) {
    // The page was never made (Xendit was down): give up after a while
    if (Date.now() - payment.createdAt.getTime() > 2 * 60_000) await failPayment(id, "The payment page couldn't be opened", log);
  } else {
    const invoice = await getInvoice(payment.invoiceId);
    if (invoice.status === "PAID" || invoice.status === "SETTLED") await confirmPaid(id, invoice.payment_channel ?? invoice.payment_method ?? null, log);
    else if (invoice.status === "EXPIRED") await failPayment(id, `It wasn't paid within ${PAY_WITHIN_MINUTES} minutes`, log);
  }
  return (await prisma.feastoPayment.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
}

/**
 * Closes a payment page nobody should pay any more. If it was paid after all, it's recorded as
 * paid instead, so no money is ever lost.
 */
async function closePayment(id: string, reason: string) {
  const status = await syncFeastoPayment(id).catch(() => "PENDING" as const);
  if (status !== "PENDING") return;
  const payment = await prisma.feastoPayment.findUnique({ where: { id }, select: { invoiceId: true } });
  try {
    if (payment?.invoiceId) await expireInvoice(payment.invoiceId);
  } catch (error) {
    if (!(error instanceof XenditError)) throw error;
    // Xendit wouldn't close it: maybe it was paid this second. Check once more.
    if ((await syncFeastoPayment(id).catch(() => "PENDING")) !== "PENDING") return;
  }
  await failPayment(id, reason, () => {});
}

/**
 * Before the admin marks cash received in person: close any payment page the store or rider still
 * has open, so they can't pay the same amount twice. One that was just paid is recorded first, and
 * the admin then sees the new amount.
 */
export async function closeOpenPayments(party: Party) {
  const open = await prisma.feastoPayment.findMany({ where: { ...partyWhere(party), status: "PENDING" }, select: { id: true } });
  for (const { id } of open) await closePayment(id, "The admin received it in person");
}

/** Payments to Feasto still waiting for Xendit, checked by the worker in case a webhook never came. */
export async function checkWaitingFeastoPayments(log: Log) {
  if (config.payments !== "xendit") return;
  const waiting = await prisma.feastoPayment.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 20_000) } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true },
  });
  for (const { id } of waiting) {
    try {
      await syncFeastoPayment(id, log);
    } catch (error) {
      log(`couldn't check Feasto payment ${id}: ${(error as Error).message}`);
    }
  }
}

/** How one payment went, for the page Xendit sends the payer back to. Only their own. */
export async function paymentResult(party: Party, id: string) {
  const mine = await prisma.feastoPayment.findFirst({ where: { id, ...partyWhere(party) }, select: { id: true } });
  if (!mine) throw new HttpError(404, "We couldn't find this payment.");
  if (config.payments === "xendit") await syncFeastoPayment(id).catch(() => null); // Xendit unreachable: show what Feasto knows
  const payment = await prisma.feastoPayment.findUniqueOrThrow({ where: { id }, select: { status: true, amount: true, method: true, invoiceUrl: true, failure: true } });
  return {
    status: payment.status,
    amount: payment.amount,
    method: ONLINE_LABEL[payment.method],
    paymentUrl: payment.status === "PENDING" ? payment.invoiceUrl : null,
    reason: payment.failure,
  };
}
