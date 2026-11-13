import { Router } from "express";
import { z } from "zod";
import type { PayoutChannel, Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { logActivity } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { notify } from "../lib/liveUpdates.js";
import { accountWords, isWallet, PAYOUT_CHANNELS, PAYOUT_LABEL, payoutSelect, payoutTotals, payoutView, requeuePayouts } from "../lib/payouts.js";
import { getBalance } from "../lib/xendit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

/**
 * Where Feasto sends a store's or rider's share of online orders, and the list of what was sent.
 * The sending itself is in lib/payouts.ts.
 */

const accountSchema = z
  .object({
    channel: z.enum(PAYOUT_CHANNELS as [PayoutChannel, ...PayoutChannel[]], "Choose an e-wallet or bank."),
    name: z.string().trim().min(2, "Enter the account name.").max(80, "Use at most 80 characters."),
    number: z.string().trim().transform((v) => v.replace(/[\s-]/g, "")),
  })
  .superRefine((v, ctx) => {
    if (isWallet(v.channel) ? !/^09\d{9}$/.test(v.number) : !/^\d{10,16}$/.test(v.number)) {
      ctx.addIssue({
        code: "custom",
        path: ["number"],
        message: isWallet(v.channel) ? `Enter the 11-digit ${PAYOUT_LABEL[v.channel]} number, like 09171234567.` : "Enter the 10 to 16 digit account number.",
      });
    }
  });

type Account = { payoutChannel: PayoutChannel | null; payoutName: string | null; payoutNumber: string | null };
const accountView = (a: Account | null) => (a?.payoutChannel && a.payoutName && a.payoutNumber ? { channel: a.payoutChannel, name: a.payoutName, number: a.payoutNumber } : null);

const list = async (where: Prisma.PayoutWhereInput, take: number) => {
  const [rows, totals] = await Promise.all([prisma.payout.findMany({ where, orderBy: { createdAt: "desc" }, take, select: payoutSelect }), payoutTotals(where)]);
  return { payouts: rows.map(payoutView), totals, mode: config.payments };
};

/** After a store or rider sets their account: anything waiting, or failed, is sent again. */
async function saved(ownerId: string, where: Prisma.PayoutWhereInput, account: z.infer<typeof accountSchema>, changed: boolean) {
  const resent = await requeuePayouts(where);
  // A changed account is worth knowing about, in case it wasn't them
  if (changed) {
    await notify(ownerId, {
      title: "Your payout account changed",
      body: `Feasto now sends your money to ${accountWords(account.channel, account.number)}. If this wasn't you, change your password.`,
    });
  }
  return resent;
}

// ---------- Store ----------

export const vendorPayoutsRouter = Router();
vendorPayoutsRouter.use(requireAuth, requireRole("VENDOR"));

vendorPayoutsRouter.get("/payouts", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const [vendor, data] = await Promise.all([
    prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { payoutChannel: true, payoutName: true, payoutNumber: true } }),
    list({ vendorId }, 10),
  ]);
  res.json({ account: accountView(vendor), ...data });
});

vendorPayoutsRouter.put("/payouts/account", async (req, res) => {
  const account = parseBody(accountSchema, req.body);
  const userId = req.session!.userId;
  const vendorId = await myVendorId(userId);
  const before = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { payoutChannel: true, payoutNumber: true } });
  await prisma.vendor.update({ where: { id: vendorId }, data: { payoutChannel: account.channel, payoutName: account.name, payoutNumber: account.number } });
  const changed = Boolean(before.payoutNumber) && (before.payoutChannel !== account.channel || before.payoutNumber !== account.number);
  const resent = await saved(userId, { vendorId }, account, changed);
  res.json({ account: { channel: account.channel, name: account.name, number: account.number }, resent });
});

vendorPayoutsRouter.post("/payouts/:id/retry", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const resent = await requeuePayouts({ id: String(req.params.id), vendorId });
  if (!resent) throw new HttpError(409, "This payout is already on its way or sent. Refresh to see the latest.");
  res.json({ ok: true });
});

// ---------- Rider ----------

export const riderPayoutsRouter = Router();
riderPayoutsRouter.use(requireAuth, requireRole("RIDER"));

riderPayoutsRouter.get("/payouts", async (req, res) => {
  const riderId = req.session!.userId;
  const [profile, data] = await Promise.all([
    prisma.riderProfile.findUnique({ where: { userId: riderId }, select: { payoutChannel: true, payoutName: true, payoutNumber: true } }),
    list({ riderId }, 10),
  ]);
  res.json({ account: accountView(profile), ...data });
});

riderPayoutsRouter.put("/payouts/account", async (req, res) => {
  const account = parseBody(accountSchema, req.body);
  const riderId = req.session!.userId;
  const before = await prisma.riderProfile.findUnique({ where: { userId: riderId }, select: { payoutChannel: true, payoutNumber: true } });
  if (!before) throw new HttpError(404, "Finish your rider sign-up first.");
  await prisma.riderProfile.update({ where: { userId: riderId }, data: { payoutChannel: account.channel, payoutName: account.name, payoutNumber: account.number } });
  const changed = Boolean(before.payoutNumber) && (before.payoutChannel !== account.channel || before.payoutNumber !== account.number);
  const resent = await saved(riderId, { riderId }, account, changed);
  res.json({ account: { channel: account.channel, name: account.name, number: account.number }, resent });
});

riderPayoutsRouter.post("/payouts/:id/retry", async (req, res) => {
  const resent = await requeuePayouts({ id: String(req.params.id), riderId: req.session!.userId });
  if (!resent) throw new HttpError(409, "This payout is already on its way or sent. Refresh to see the latest.");
  res.json({ ok: true });
});

// ---------- Admin ----------

export const adminPayoutsRouter = Router();
adminPayoutsRouter.use(requireAuth, requireRole("ADMIN"));

adminPayoutsRouter.get("/payouts", async (_req, res) => {
  const [data, balance] = await Promise.all([
    list({}, 25),
    // Feasto's money at Xendit, which payouts are sent from. Empty if the key can't read it.
    config.payments === "xendit"
      ? getBalance()
          .then((b) => b.balance)
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  res.json({ ...data, balance });
});

/** Sends one failed payout again, or every failed one when no id is given. */
adminPayoutsRouter.post("/payouts/retry", async (req, res) => {
  const { id } = parseBody(z.object({ id: z.string().min(1).optional() }), req.body ?? {});
  const resent = await requeuePayouts({ ...(id && { id }), status: "FAILED" });
  if (!resent) throw new HttpError(409, "There's no failed payout to send. Refresh to see the latest.");
  await prisma.$transaction((tx) =>
    logActivity(tx, { userId: req.session!.userId, name: req.session!.name }, { category: "EARNINGS", action: "Sent payouts again", target: id ? "1 payout" : `${resent} payouts`, detail: "After they failed at Xendit" }),
  );
  res.json({ resent });
});
