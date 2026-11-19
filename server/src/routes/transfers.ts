import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router, type Request } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { Prisma, type ReceiveChannel } from "../generated/prisma/client.js";
import { logActivity, notifyAdmin, type Actor } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { confirmPaid, failPayment } from "../lib/paymentFlow.js";
import { perAccount } from "../lib/rateLimit.js";
import { removeDocument } from "../lib/renewals.js";
import { accountLine, RECEIVE_LABEL, refProblem, SEND_WITHIN_MINUTES, spaced } from "../lib/transfers.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { CONTENT_TYPE, detectDocumentType, MAX_BYTES, sendDocument } from "./documents.js";
import { UPLOADED_PHOTO } from "./uploads.js";

/**
 * Feasto's own accounts that residents can send a transfer to (the admin sets them), the resident's
 * side of a transfer (see the account, send the receipt), and the admin's check of each one.
 * How it fits the online payment saga is in lib/transfers.ts.
 */

const actorOf = (req: Request): Actor => ({ userId: req.session!.userId, name: req.session!.name });
const CHANNELS = ["GCASH", "MAYA", "BANK"] as const satisfies readonly ReceiveChannel[];

const accountView = (a: { id: string; channel: ReceiveChannel; bankName: string | null; accountName: string; accountNumber: string; qrUrl: string | null; enabled: boolean }) => ({
  id: a.id,
  channel: a.channel,
  label: a.channel === "BANK" ? (a.bankName ?? "Bank") : RECEIVE_LABEL[a.channel],
  bankName: a.bankName,
  accountName: a.accountName,
  accountNumber: a.accountNumber,
  shownNumber: spaced(a.accountNumber),
  qrUrl: a.qrUrl,
  enabled: a.enabled,
});

// ---------- The admin's accounts ----------

export const adminTransfersRouter = Router();
adminTransfersRouter.use(requireAuth, requireRole("ADMIN"));

const accountSchema = z
  .object({
    channel: z.enum(CHANNELS, "Choose GCash, Maya or a bank."),
    bankName: z.string().trim().max(40).optional().transform((v) => v || null),
    accountName: z
      .string()
      .trim()
      .min(2, "Enter the name on the account, as the sender will see it.")
      .max(60, "Use at most 60 characters.")
      .regex(/^[\p{L}\d .,'&()-]+$/u, "Use letters, numbers, spaces and . , ' & ( ) - only."),
    accountNumber: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")),
    qrUrl: z.string().regex(UPLOADED_PHOTO, "Upload the QR code as a photo.").nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.channel === "BANK") {
      if (!v.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "Enter the bank, like BDO or BPI." });
      if (!/^\d{10,16}$/.test(v.accountNumber)) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Enter the 10 to 16 digit account number." });
    } else if (!/^09\d{9}$/.test(v.accountNumber)) {
      ctx.addIssue({ code: "custom", path: ["accountNumber"], message: `Enter the 11-digit ${RECEIVE_LABEL[v.channel]} number, like 09171234567.` });
    }
  });

adminTransfersRouter.get("/receiving-accounts", async (_req, res) => {
  const accounts = await prisma.receivingAccount.findMany({ orderBy: [{ enabled: "desc" }, { createdAt: "asc" }], include: { _count: { select: { checkouts: true } } } });
  res.json({ accounts: accounts.map((a) => ({ ...accountView(a), used: a._count.checkouts })) });
});

adminTransfersRouter.post("/receiving-accounts", async (req, res) => {
  const input = parseBody(accountSchema, req.body);
  const account = await prisma.$transaction(async (tx) => {
    const created = await tx.receivingAccount.create({ data: { ...input, bankName: input.channel === "BANK" ? input.bankName : null, qrUrl: input.qrUrl ?? null } });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Added an account residents can pay to", target: accountLine(created) });
    return created;
  });
  res.status(201).json({ account: accountView(account) });
});

adminTransfersRouter.put("/receiving-accounts/:id", async (req, res) => {
  const input = parseBody(accountSchema, req.body);
  const id = String(req.params.id);
  const account = await prisma.$transaction(async (tx) => {
    const before = await tx.receivingAccount.findUnique({ where: { id } });
    if (!before) throw new HttpError(404, "We couldn't find this account.");
    const updated = await tx.receivingAccount.update({ where: { id }, data: { ...input, bankName: input.channel === "BANK" ? input.bankName : null, qrUrl: input.qrUrl ?? null } });
    const what = before.enabled !== updated.enabled && accountLine(before) === accountLine(updated) ? (updated.enabled ? "Turned on" : "Turned off") : "Changed";
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: `${what} an account residents can pay to`, target: accountLine(updated), detail: what === "Changed" ? `Was ${accountLine(before)}` : null });
    return updated;
  });
  res.json({ account: accountView(account) });
});

/** Removing works only for an account nobody has paid to yet; one with payments is turned off instead, to keep the record */
adminTransfersRouter.delete("/receiving-accounts/:id", async (req, res) => {
  const id = String(req.params.id);
  await prisma.$transaction(async (tx) => {
    const account = await tx.receivingAccount.findUnique({ where: { id }, include: { _count: { select: { checkouts: true } } } });
    if (!account) throw new HttpError(404, "We couldn't find this account.");
    if (account._count.checkouts > 0) throw new HttpError(409, "Residents have paid to this account, so it stays on record. Turn it off instead.");
    await tx.receivingAccount.delete({ where: { id } });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Removed an account residents can pay to", target: accountLine(account) });
  });
  res.json({ ok: true });
});

// ---------- The admin checks the transfers ----------

const transferSelect = {
  id: true,
  total: true,
  createdAt: true,
  transferTo: true,
  transferRef: true,
  transferFrom: true,
  transferSentAt: true,
  transferCheckedAt: true,
  transferNote: true,
  transferProof: true,
  paymentStatus: true,
  transferAccount: { select: { channel: true } },
  resident: { select: { name: true, phone: true } },
  orders: { select: { id: true, status: true, vendor: { select: { name: true } } } },
} as const;

type TransferRow = Prisma.CheckoutGetPayload<{ select: typeof transferSelect }>;
const transferView = (c: TransferRow) => ({
  checkoutId: c.id,
  amount: Number(c.total),
  createdAt: c.createdAt,
  to: c.transferTo,
  channel: c.transferAccount?.channel ?? null,
  ref: c.transferRef,
  from: c.transferFrom,
  sentAt: c.transferSentAt,
  checkedAt: c.transferCheckedAt,
  note: c.transferNote,
  hasProof: Boolean(c.transferProof),
  status: c.paymentStatus,
  resident: c.resident,
  stores: [...new Set(c.orders.map((o) => o.vendor.name))],
  orders: c.orders.map((o) => ({ id: o.id, status: o.status })),
});

adminTransfersRouter.get("/transfers", async (req, res) => {
  const { status } = z.object({ status: z.enum(["WAITING", "CHECKED"]).catch("WAITING") }).parse(req.query);
  const where: Prisma.CheckoutWhereInput =
    status === "WAITING" ? { transferSentAt: { not: null }, paymentStatus: "PENDING" } : { transferAccountId: { not: null }, transferCheckedAt: { not: null } };
  const [rows, waiting, unsent] = await Promise.all([
    prisma.checkout.findMany({ where, orderBy: status === "WAITING" ? { transferSentAt: "asc" } : { transferCheckedAt: "desc" }, take: 50, select: transferSelect }),
    prisma.checkout.count({ where: { transferSentAt: { not: null }, paymentStatus: "PENDING" } }),
    prisma.checkout.count({ where: { transferAccountId: { not: null }, transferSentAt: null, paymentStatus: "PENDING" } }),
  ]);
  res.json({ transfers: rows.map(transferView), waiting, unsent });
});

adminTransfersRouter.get("/transfers/:id/proof", async (req, res) => {
  const checkout = await prisma.checkout.findUnique({ where: { id: String(req.params.id) }, select: { transferProof: true } });
  if (!checkout?.transferProof) throw new HttpError(404, "No receipt was sent for this payment.");
  await sendDocument(res, checkout.transferProof);
});

/** Found in the account's history with the same amount and reference: the orders go to their stores */
adminTransfersRouter.post("/transfers/:id/confirm", async (req, res) => {
  const id = String(req.params.id);
  const checkout = await prisma.checkout.findUnique({ where: { id }, select: { transferSentAt: true, paymentStatus: true, transferRef: true, total: true, transferTo: true } });
  if (!checkout?.transferSentAt) throw new HttpError(404, "We couldn't find this transfer.");
  if (checkout.paymentStatus !== "PENDING") throw new HttpError(409, "This payment was already checked. Refresh to see it.");
  const confirmed = await confirmPaid(id, "TRANSFER");
  if (!confirmed) throw new HttpError(409, "This payment was already checked. Refresh to see it.");
  await prisma.$transaction(async (tx) => {
    await tx.checkout.update({ where: { id }, data: { transferCheckedAt: new Date() } });
    await logActivity(tx, actorOf(req), { category: "ORDERS", action: "Confirmed a transfer", target: `₱${Number(checkout.total).toFixed(2)} to ${checkout.transferTo}`, detail: `Ref. ${checkout.transferRef}` });
  });
  res.json({ ok: true });
});

/** Not in the account's history (or a different amount): the checkout is undone and the resident told why */
adminTransfersRouter.post("/transfers/:id/reject", async (req, res) => {
  const id = String(req.params.id);
  const { note } = parseBody(z.object({ note: z.string().trim().min(5, "Say why, so the resident knows what to fix.").max(200) }), req.body);
  const checkout = await prisma.checkout.findUnique({ where: { id }, select: { transferSentAt: true, paymentStatus: true, transferRef: true, total: true, transferTo: true } });
  if (!checkout?.transferSentAt) throw new HttpError(404, "We couldn't find this transfer.");
  const failed = await failPayment(
    id,
    "The transfer couldn't be confirmed",
    () => {},
    `Feasto couldn't confirm your transfer: ${note} Your order was cancelled. If you did send money, report it from the order and the admin will check again.`,
  );
  if (!failed) throw new HttpError(409, "This payment was already checked. Refresh to see it.");
  await prisma.$transaction(async (tx) => {
    // The reference is freed, so a mistyped one can be sent again on a new order
    await tx.checkout.update({ where: { id }, data: { transferCheckedAt: new Date(), transferNote: note, transferRef: null } });
    await logActivity(tx, actorOf(req), { category: "ORDERS", action: "Couldn't confirm a transfer", target: `₱${Number(checkout.total).toFixed(2)} to ${checkout.transferTo}`, detail: `Ref. ${checkout.transferRef}: ${note}` });
  });
  res.json({ ok: true });
});

// ---------- The resident's side ----------

export const transfersRouter = Router();
transfersRouter.use(requireAuth, requireRole("RESIDENT"));

/** The accounts the admin turned on, to choose from at checkout */
transfersRouter.get("/accounts", async (_req, res) => {
  const accounts = await prisma.receivingAccount.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  res.json({ accounts: accounts.map(accountView), sendWithinMinutes: SEND_WITHIN_MINUTES });
});

async function myTransfer(req: Request) {
  const checkout = await prisma.checkout.findFirst({
    where: { id: String(req.params.id), residentId: req.session!.userId, transferAccountId: { not: null } },
    select: { ...transferSelect, transferAccount: true },
  });
  if (!checkout?.transferAccount) throw new HttpError(404, "We couldn't find this payment.");
  return checkout as typeof checkout & { transferAccount: NonNullable<typeof checkout.transferAccount> };
}

transfersRouter.get("/:id", async (req, res) => {
  const c = await myTransfer(req);
  res.json({
    transfer: {
      ...transferView(c),
      account: accountView(c.transferAccount),
      sendBy: new Date(c.createdAt.getTime() + SEND_WITHIN_MINUTES * 60_000),
    },
  });
});

/** The receipt's screenshot. It shows the resident's name and number, so it's kept private like the documents. */
transfersRouter.put(
  "/:id/proof",
  perAccount("upload", 30, 600, "You've uploaded a lot of files just now."),
  express.raw({ type: Object.values(CONTENT_TYPE), limit: MAX_BYTES }),
  async (req, res) => {
    const c = await myTransfer(req);
    if (c.paymentStatus !== "PENDING" || c.transferSentAt) throw new HttpError(409, "This payment was already sent to the admin.");
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Choose a screenshot of the receipt.");
    const extension = detectDocumentType(data);
    if (!extension || extension === "pdf") throw new HttpError(400, "That file isn't a JPG, PNG or WebP picture.");
    const name = `${randomBytes(16).toString("hex")}.${extension}`;
    await mkdir(config.documentDir, { recursive: true });
    await writeFile(path.join(config.documentDir, name), data);
    const { count } = await prisma.checkout.updateMany({ where: { id: c.id, transferSentAt: null, paymentStatus: "PENDING" }, data: { transferProof: name } });
    if (count === 0) {
      await removeDocument(name);
      throw new HttpError(409, "This payment was already sent to the admin.");
    }
    await removeDocument(c.transferProof);
    res.json({ ok: true });
  },
);

transfersRouter.get("/:id/proof", async (req, res) => {
  const c = await myTransfer(req);
  if (!c.transferProof) throw new HttpError(404, "No receipt yet.");
  await sendDocument(res, c.transferProof);
});

const sentSchema = z.object({
  ref: z.string().trim().transform((v) => v.replace(/[\s-]/g, "").toUpperCase()),
  /** The resident's account it came from: name and number, so the admin can find it and a refund knows where to go */
  fromName: z.string().trim().min(2, "Enter the name on the account you sent from.").max(60),
  fromNumber: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")),
});

/** "I've sent it": the reference number and the account it came from, after the receipt's photo */
transfersRouter.post("/:id/sent", perAccount("transfer-sent", 10, 600, "Too many tries. Wait a few minutes."), async (req, res) => {
  const c = await myTransfer(req);
  const input = parseBody(sentSchema, req.body);
  const channel = c.transferAccount.channel;
  const problem = refProblem(channel, input.ref);
  const wallet = channel !== "BANK";
  const numberProblem = wallet ? !/^09\d{9}$/.test(input.fromNumber) && "Enter the 11-digit mobile number you sent from." : !/^\d{4,16}$/.test(input.fromNumber) && "Enter your account number (or its last 4 digits).";
  if (problem || numberProblem) throw new ValidationError({ ...(problem && { ref: [problem] }), ...(numberProblem && { fromNumber: [numberProblem] }) });
  if (c.paymentStatus !== "PENDING") throw new HttpError(409, "This order isn't waiting for payment anymore.");
  if (!c.transferProof) throw new ValidationError({ proof: ["Add a screenshot of the receipt first."] });
  if (Date.now() > c.createdAt.getTime() + SEND_WITHIN_MINUTES * 60_000) throw new HttpError(409, `It's been more than ${SEND_WITHIN_MINUTES} minutes, so the order was cancelled. Order again to pay.`);

  const from = `${wallet ? RECEIVE_LABEL[channel] : "Account"} ${spaced(input.fromNumber)} (${input.fromName})`;
  try {
    const { count } = await prisma.checkout.updateMany({
      where: { id: c.id, paymentStatus: "PENDING", transferSentAt: null },
      data: { transferRef: input.ref, transferFrom: from, transferSentAt: new Date() },
    });
    if (count === 0) throw new HttpError(409, "This payment was already sent to the admin.");
  } catch (error) {
    // The same receipt can't pay for two orders
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ValidationError({ ref: ["This reference number was already used for another order."] });
    throw error;
  }
  await notifyAdmin({ title: "A transfer to check", body: `₱${Number(c.total).toFixed(2)} from ${c.resident.name} to ${c.transferTo}. Ref. ${input.ref}.`, link: "/admin/transfers" });
  res.json({ ok: true });
});
