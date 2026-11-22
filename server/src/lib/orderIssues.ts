import type { IssueKind, IssuePayer } from "../generated/prisma/client.js";
import { notifyAdmin } from "./activity.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { orderCode } from "./orders.js";
import { enqueue } from "./outbox.js";
import { QUEUES } from "./rabbitmq.js";
import { getSettings } from "./settings.js";

/**
 * "Something's wrong with my order", after it arrives: a missing or wrong item, spilled food, cold or
 * very late. The resident sends it with a photo within the admin's window (24 hours by default).
 *
 *   1. The store answers first: give some or all of it back, or say no with a reason.
 *   2. Turned down, the resident can ask Feasto; the admin decides, and who pays (the store, or Feasto
 *      when the ride was the problem).
 *   3. What's given back: paid online, a refund to how they paid (Xendit); paid in cash, Suki points
 *      worth the same (cash can't be sent back by itself).
 *   The store's share is added to what it owes Feasto (lib/earnings.ts), since Feasto paid the resident.
 */

export const ISSUE_LABEL: Record<IssueKind, string> = {
  MISSING_ITEM: "Something was missing",
  WRONG_ITEM: "Wrong item",
  DAMAGED: "Spilled or damaged",
  COLD_OR_LATE: "Cold or very late",
  OTHER: "Something else",
};

const c = (n: number) => Math.round(n * 100) / 100;

/** The most that can be given back for these items (or the whole food when none are picked), after discounts */
export async function issueLimit(orderId: string, itemIds: string[]) {
  const o = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { subtotal: true, storeDiscount: true, feastoDiscount: true, items: { select: { id: true, unitPrice: true, quantity: true, discount: true, removedAt: true } } },
  });
  const food = c(Number(o.subtotal) - Number(o.storeDiscount) - Number(o.feastoDiscount));
  if (!itemIds.length) return Math.max(0, food);
  const picked = o.items.filter((i) => itemIds.includes(i.id) && !i.removedAt).reduce((n, i) => n + Number(i.unitPrice) * i.quantity - Number(i.discount), 0);
  return Math.max(0, Math.min(food, c(picked)));
}

/** The resident reports it (checked: their order, arrived, within the window, one at a time) */
export async function reportIssue(userId: string, orderId: string, input: { kind: IssueKind; itemIds: string[]; note: string; photoUrl: string }) {
  const settings = await getSettings();
  const order = await prisma.order.findFirst({
    where: { id: orderId, checkout: { residentId: userId } },
    select: { status: true, finishedAt: true, vendor: { select: { ownerId: true, name: true } }, items: { select: { id: true } }, issues: { select: { status: true } } },
  });
  if (!order) throw new HttpError(404, "We couldn't find this order.");
  if (!["DELIVERED", "COMPLETED"].includes(order.status) || !order.finishedAt) throw new HttpError(409, "A problem can be reported once the order arrives.");
  if (Date.now() - order.finishedAt.getTime() > settings.issueHours * 3600_000) throw new HttpError(409, `Problems can be reported within ${settings.issueHours} hours of delivery. Contact the store, or report the user from the order page.`);
  if (order.issues.some((i) => i.status === "OPEN")) throw new HttpError(409, "There's already a problem being looked at on this order.");
  if (order.issues.length >= 2) throw new HttpError(409, "This order already had two problems reported.");
  const itemIds = input.itemIds.filter((id) => order.items.some((i) => i.id === id));
  const issue = await prisma.orderIssue.create({ data: { orderId, residentId: userId, kind: input.kind, itemIds, note: input.note, photoUrl: input.photoUrl } });
  await notify(order.vendor.ownerId, { title: `Problem with ${orderCode(orderId)}`, body: `${ISSUE_LABEL[input.kind]}: "${input.note.slice(0, 80)}". Answer it in Orders.`, link: `/vendor/orders/${orderId}` });
  return issue;
}

/** Gives it back (refund or credit) and records who pays. Once: a decided problem stays decided. */
export async function resolveIssue(issueId: string, input: { amount: number; paidBy: IssuePayer; answer: string | null; by: string }) {
  const issue = await prisma.orderIssue.findUnique({
    where: { id: issueId },
    select: { status: true, orderId: true, itemIds: true, residentId: true, order: { select: { vendor: { select: { name: true } }, checkout: { select: { paymentMethod: true, paymentStatus: true } } } } },
  });
  if (!issue) throw new HttpError(404, "That problem isn't there anymore.");
  if (issue.status !== "OPEN") throw new HttpError(409, "This problem was already answered.");
  const limit = await issueLimit(issue.orderId, issue.itemIds);
  const amount = c(input.amount);
  if (amount <= 0 || amount > limit + 0.001) throw new HttpError(400, `Give back ₱1 to ₱${limit.toFixed(2)} (what the ${issue.itemIds.length ? "items" : "food"} cost after discounts).`);
  const online = issue.order.checkout.paymentMethod === "ONLINE" && ["PAID", "REFUNDED"].includes(issue.order.checkout.paymentStatus);
  const settings = await getSettings();
  const points = Math.ceil(amount / settings.pointValue);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.orderIssue.updateMany({
      where: { id: issueId, status: "OPEN" },
      data: { status: "RESOLVED", amount, paidBy: input.paidBy, given: online ? "refund" : "credit", answer: input.answer, decidedById: input.by, decidedAt: new Date() },
    });
    if (!count) throw new HttpError(409, "This problem was already answered.");
    if (online) await enqueue(tx, QUEUES.refundRequested, { orderId: issue.orderId, itemId: `issue-${issueId}`, amount, reason: "A problem with your order" });
    else await tx.pointsGrant.create({ data: { userId: issue.residentId, points, reason: "REFUND", key: `issue:${issueId}`, note: `Credit for a problem with ${orderCode(issue.orderId)}` } });
  });
  if (!online) {
    await notify(issue.residentId, {
      title: `₱${amount.toFixed(2)} credit for ${orderCode(issue.orderId)}`,
      body: `${issue.order.vendor.name} made it right: ${points} Suki points, worth ₱${amount.toFixed(2)} off your next order.${input.answer ? ` "${input.answer}"` : ""}`,
      link: `/resident/orders/${issue.orderId}`,
    });
  } else if (input.answer) {
    await notify(issue.residentId, { title: `${issue.order.vendor.name} answered`, body: `₱${amount.toFixed(2)} is being refunded. "${input.answer}"`, link: `/resident/orders/${issue.orderId}` });
  }
}

/** The store (or the admin) says no, with the reason the resident sees */
export async function rejectIssue(issueId: string, answer: string, by: string, final: boolean) {
  const issue = await prisma.orderIssue.findUnique({ where: { id: issueId }, select: { status: true, orderId: true, residentId: true } });
  if (!issue) throw new HttpError(404, "That problem isn't there anymore.");
  const { count } = await prisma.orderIssue.updateMany({ where: { id: issueId, status: "OPEN" }, data: { status: "REJECTED", answer, decidedById: by, decidedAt: new Date() } });
  if (!count) throw new HttpError(409, "This problem was already answered.");
  await notify(issue.residentId, {
    title: `About the problem with ${orderCode(issue.orderId)}`,
    body: `${final ? "Feasto" : "The store"} said: "${answer}".${final ? "" : " Not fair? Ask Feasto to look, from the order page."}`,
    link: `/resident/orders/${issue.orderId}`,
  });
}

/** Turned down by the store: the resident asks the admin (once) */
export async function escalateIssue(userId: string, orderId: string, issueId: string) {
  const { count } = await prisma.orderIssue.updateMany({
    where: { id: issueId, orderId, residentId: userId, status: "REJECTED", escalatedAt: null, decidedAt: { not: null } },
    data: { status: "OPEN", escalatedAt: new Date() },
  });
  if (!count) throw new HttpError(409, "This can be sent to Feasto once, after the store says no.");
  await notifyAdmin({ title: `A resident asks Feasto about ${orderCode(orderId)}`, body: "The store said no to their problem. Decide it in Admin › Orders › Problems.", link: "/admin/orders?tab=issues" });
}
