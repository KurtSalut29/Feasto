import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { joinPlus, plusFor, plusStats, syncPlus } from "../lib/plus.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { originOf } from "./checkout.js";

/** Feasto Plus for residents: what it gives, their month, and joining */
export const plusRouter = Router();
plusRouter.use(requireAuth, requireRole("RESIDENT"));

plusRouter.get("/", async (req, res) => {
  res.json(await plusFor(req.session!.userId));
});

const METHODS = ["GCASH", "MAYA", "GRABPAY", "SHOPEEPAY", "COINS", "VISA", "MASTERCARD", "JCB", "AMEX"] as const;

/** Opens Xendit's page to pay for a month (or turns it on at once with simulated payments) */
plusRouter.post("/join", async (req, res) => {
  const { method } = parseBody(z.object({ method: z.enum(METHODS).optional() }), req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.session!.userId }, select: { email: true } });
  res.json(await joinPlus(req.session!.userId, user.email, method ?? null, originOf(req)));
});

/** How a month's payment went, for the page Xendit sends the resident back to. Only their own. */
plusRouter.get("/payment/:id", async (req, res) => {
  const id = String(req.params.id);
  const mine = await prisma.plusMembership.findFirst({ where: { id, userId: req.session!.userId }, select: { id: true } });
  if (!mine) throw new HttpError(404, "We couldn't find that payment.");
  const status = await syncPlus(id).catch(() => null);
  res.json({ status: status ?? (await prisma.plusMembership.findUniqueOrThrow({ where: { id }, select: { status: true } })).status });
});

export const adminPlusRouter = Router();
adminPlusRouter.use(requireAuth, requireRole("ADMIN"));
adminPlusRouter.get("/", async (_req, res) => {
  res.json(await plusStats());
});
