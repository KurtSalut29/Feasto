import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/db.js";
import { syncPayment } from "../lib/paymentFlow.js";
import { syncPayout } from "../lib/payouts.js";
import { isFromXendit } from "../lib/xendit.js";

export const paymentsRouter = Router();

const payoutEvent = z.object({
  event: z.string().startsWith("payout."),
  data: z.object({ id: z.string().min(1).max(80), reference_id: z.string().max(64).optional() }).passthrough(),
});
const invoiceEvent = z.object({ id: z.string().min(1).max(64), external_id: z.string().max(64).optional() }).passthrough();

/**
 * Xendit calls this when an invoice is paid or expires, or a payout to a store or rider is sent or fails. It's checked twice: the token proves the
 * call came from Xendit, and Feasto then asks Xendit for the invoice itself instead of trusting
 * what the call says (the same for payouts). Answering 200 quickly tells Xendit not to send it again.
 */
paymentsRouter.post("/xendit", async (req, res) => {
  if (config.payments !== "xendit" || !isFromXendit(req.get("x-callback-token"))) {
    res.status(401).json({ error: "Not from Xendit." });
    return;
  }
  // A payout to a store or rider changed (payout.succeeded, payout.failed...)
  const payout = payoutEvent.safeParse(req.body);
  if (payout.success) {
    const { id, reference_id } = payout.data.data;
    const found = await prisma.payout.findFirst({ where: { OR: [{ xenditId: id }, ...(reference_id ? [{ id: reference_id }] : [])] }, select: { id: true } });
    const status = found ? await syncPayout(found.id, (...args) => console.log("[payout webhook]", ...args)) : null;
    res.json({ ok: true, known: Boolean(found), status });
    return;
  }
  const event = invoiceEvent.safeParse(req.body);
  if (!event.success) {
    res.status(400).json({ error: "Not an invoice event." });
    return;
  }
  const checkout = await prisma.checkout.findFirst({ where: { OR: [{ paymentRef: event.data.id }, ...(event.data.external_id ? [{ id: event.data.external_id }] : [])] }, select: { id: true } });
  // Xendit's "Test webhook" button, or an invoice from another app on the same account
  if (!checkout) {
    res.json({ ok: true, known: false });
    return;
  }
  const status = await syncPayment(checkout.id);
  res.json({ ok: true, status });
});
