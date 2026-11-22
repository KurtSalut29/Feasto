import type { OnlinePayment, Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { notifyAdmin } from "./activity.js";
import { prisma } from "./db.js";
import { broadcastErrand, tellNearbyRiders } from "./errands.js";
import { notify } from "./liveUpdates.js";
import { orderCode } from "./orders.js";
import { enqueue } from "./outbox.js";
import { QUEUES } from "./rabbitmq.js";
import { createInvoice, getInvoice, PAY_WITHIN_MINUTES, refundInvoice, XenditError } from "./xendit.js";

/**
 * A Pabili paid online first: for a budget above what a rider can lend in cash (up to the admin's
 * prepaid limit), or by choice.
 *
 *   1. The resident pays the budget plus the most the fee can be, on Xendit's page. Riders don't see
 *      it until Xendit says it's paid (the return, the webhook or the worker's check).
 *   2. The rider buys and sends the receipt: what's left (budget + most fee − receipt − fee) is
 *      refunded to the resident right away. Nothing is paid at the door.
 *   3. Delivered: Feasto pays the rider back (the receipt plus the fee, minus Feasto's share) to their
 *      e-wallet or bank, like their share of an online order.
 *   Cancelled before buying, or nothing could be bought: all of it is refunded.
 */

type Log = (...args: unknown[]) => void;
type Tx = Prisma.TransactionClient;

export const PABILI_EXTERNAL_PREFIX = "feasto-pabili-";
const PREFERRED_SECONDS = 90;

const peso = (n: unknown) => Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const c = (n: number) => Math.round(n * 100) / 100;

/** What the resident pays up front: the budget and the most the fee can be */
export const prepaidAmount = (e: { budget: unknown; feeMax: unknown; deliveryFee: unknown }) => c(Number(e.budget) + Number(e.feeMax ?? e.deliveryFee));

/** Opens Xendit's page for a new prepaid Pabili, or, with simulated payments, counts it as paid at once */
export async function startPabiliPayment(errandId: string, origin: string, method: OnlinePayment | null, email: string) {
  const e = await prisma.errand.findUniqueOrThrow({ where: { id: errandId }, select: { budget: true, feeMax: true, deliveryFee: true, shopName: true } });
  const amount = prepaidAmount(e);
  if (config.payments !== "xendit") {
    await markPaid(errandId, "SIMULATED", amount);
    return null;
  }
  try {
    const invoice = await createInvoice({
      externalId: `${PABILI_EXTERNAL_PREFIX}${errandId}`,
      amount,
      description: `Pabili at ${e.shopName} ${orderCode(errandId)}: budget and the most delivery fee (what isn't used comes back)`,
      method,
      returnUrl: `${origin}/resident/pabili/${errandId}?pay=1`,
      email: email.endsWith("feasto.com") ? undefined : email,
      items: [],
    });
    await prisma.errand.update({ where: { id: errandId }, data: { paymentRef: invoice.id, paymentUrl: invoice.invoice_url } });
    return invoice.invoice_url;
  } catch (error) {
    await prisma.errand.updateMany({ where: { id: errandId, status: "REQUESTED" }, data: { status: "CANCELLED", paymentStatus: "FAILED", cancelReason: "The payment page couldn't be opened", finishedAt: new Date() } });
    throw error;
  }
}

/** Paid: riders can see it now (the one asked for first, for 90 seconds) */
async function markPaid(errandId: string, channel: string | null, amount: number) {
  const { count } = await prisma.errand.updateMany({
    where: { id: errandId, prepaid: true, paymentStatus: "PENDING", status: "REQUESTED" },
    data: { paymentStatus: "PAID", paidChannel: channel, paidAmount: amount, paidAt: new Date() },
  });
  if (!count) return false;
  const e = await prisma.errand.findUniqueOrThrow({ where: { id: errandId }, select: { id: true, residentId: true, status: true, shopName: true, deliveryLat: true, deliveryLng: true, preferredRiderId: true, budget: true } });
  if (e.preferredRiderId) {
    await prisma.errand.update({ where: { id: errandId }, data: { exclusiveUntil: new Date(Date.now() + PREFERRED_SECONDS * 1000) } });
    await notify(e.preferredRiderId, { title: "A Pabili asked for you (paid online)", body: `Buy at ${e.shopName} (up to ₱${peso(e.budget)}). It's paid already: Feasto pays you back after you deliver.`, link: "/rider" });
  } else await tellNearbyRiders(e);
  await notify(e.residentId, { title: "Pabili paid", body: `₱${peso(amount)} received. Riders can take it now; what isn't used comes back to you.`, link: `/resident/pabili/${errandId}` });
  await broadcastErrand(e);
  return true;
}

/** Asks Xendit how a prepaid Pabili's payment went */
export async function syncPabiliPayment(errandId: string, log: Log = () => {}) {
  const e = await prisma.errand.findUnique({ where: { id: errandId }, select: { prepaid: true, paymentStatus: true, paymentRef: true, createdAt: true, budget: true, feeMax: true, deliveryFee: true, residentId: true } });
  if (!e?.prepaid || e.paymentStatus !== "PENDING") return e?.paymentStatus ?? null;
  if (!e.paymentRef) return "PENDING";
  const invoice = await getInvoice(e.paymentRef);
  if (invoice.status === "PAID" || invoice.status === "SETTLED") {
    if (await markPaid(errandId, invoice.payment_channel ?? invoice.payment_method ?? null, Number(invoice.amount ?? prepaidAmount(e)))) log(`pabili ${errandId.slice(-6)} paid online`);
  } else if (invoice.status === "EXPIRED") {
    const { count } = await prisma.errand.updateMany({
      where: { id: errandId, status: "REQUESTED", paymentStatus: "PENDING" },
      data: { status: "CANCELLED", paymentStatus: "FAILED", cancelReason: "Not paid in time", finishedAt: new Date() },
    });
    if (count) {
      await notify(e.residentId, { title: "Pabili not paid", body: `It wasn't paid within ${PAY_WITHIN_MINUTES} minutes, so it was cancelled. Nothing was charged.`, link: `/resident/pabili/${errandId}` });
      await broadcastErrand({ id: errandId, residentId: e.residentId, status: "CANCELLED" });
    }
  }
  return (await prisma.errand.findUnique({ where: { id: errandId }, select: { paymentStatus: true } }))?.paymentStatus ?? null;
}

/** Prepaid Pabili still waiting for Xendit, checked by the worker in case a webhook never came */
export async function checkWaitingPabili(log: Log) {
  if (config.payments !== "xendit") return;
  const waiting = await prisma.errand.findMany({ where: { prepaid: true, paymentStatus: "PENDING", status: "REQUESTED", createdAt: { lt: new Date(Date.now() - 20_000) } }, take: 20, select: { id: true } });
  for (const { id } of waiting) await syncPabiliPayment(id, log).catch((error) => log(`couldn't check pabili payment ${id}: ${(error as Error).message}`));
}

/**
 * Gives money back on a prepaid Pabili: what's left after the receipt, or all of it when nothing was
 * bought. Recorded on the errand; a refund Xendit refuses goes to the admin to do by hand.
 */
export async function refundPabili(errandId: string, amount: number, why: string, log: Log = () => {}) {
  const e = await prisma.errand.findUnique({ where: { id: errandId }, select: { prepaid: true, paymentStatus: true, paymentRef: true, paidAmount: true, refundedAmount: true, residentId: true } });
  if (!e?.prepaid || e.paymentStatus !== "PAID") return 0;
  const left = c(Number(e.paidAmount ?? 0) - Number(e.refundedAmount));
  const give = c(Math.min(amount, left));
  if (give <= 0) return 0;
  try {
    if (config.payments === "xendit" && e.paymentRef) {
      await refundInvoice({ invoiceId: e.paymentRef, amount: give, referenceId: `pabili-${errandId}-${Math.round(Number(e.refundedAmount) * 100)}`, reason: "OTHERS" });
    }
    await prisma.errand.update({ where: { id: errandId }, data: { refundedAmount: { increment: give }, ...(c(left - give) <= 0 && { paymentStatus: "REFUNDED" }) } });
    await notify(e.residentId, { title: `₱${peso(give)} coming back`, body: `${why} It goes back to how you paid.`, link: `/resident/pabili/${errandId}` });
    log(`pabili ${errandId.slice(-6)}: refunded ₱${give}`);
    return give;
  } catch (error) {
    const reason = error instanceof XenditError ? error.message : (error as Error).message;
    await notifyAdmin({ title: `Refund ₱${peso(give)} by hand`, body: `Pabili ${orderCode(errandId)}: Xendit refused the refund (${reason}). ${why}`, link: "/admin/pabili" });
    return 0;
  }
}

/** Delivered: Feasto pays the rider back what they spent, plus their fee minus Feasto's share */
export async function payRiderBack(tx: Tx, errandId: string) {
  const e = await tx.errand.findUnique({ where: { id: errandId }, select: { prepaid: true, paymentStatus: true, riderId: true, receiptTotal: true, deliveryFee: true, feastoCut: true, status: true } });
  if (!e?.prepaid || !e.riderId || e.status !== "DELIVERED" || !["PAID", "REFUNDED"].includes(e.paymentStatus ?? "")) return null;
  const amount = c(Number(e.receiptTotal ?? 0) + Number(e.deliveryFee) - Number(e.feastoCut));
  if (amount <= 0) return null;
  const created = await tx.payout.createManyAndReturn({ data: [{ errandId, party: "RIDER", riderId: e.riderId, amount }], skipDuplicates: true, select: { id: true } });
  for (const p of created) await enqueue(tx, QUEUES.payoutRequested, { payoutId: p.id });
  return amount;
}
