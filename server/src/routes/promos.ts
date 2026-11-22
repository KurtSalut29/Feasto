import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { logActivity } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { bestDeal, clock, dealsNow, liveSpend, liveUses, vouchersFor } from "../lib/promos.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

/**
 * Promos for each kind of account:
 * - Admin › Promos: Feasto's vouchers (with a budget Feasto pays from, and a first-order voucher)
 *   and the sale days (11.11, 12.12, payday), with what each has cost so far.
 * - Store › Deals: the store's own price cuts on its dishes (all day, or a happy hour) and its own
 *   vouchers, all paid by the store.
 * - Residents: "My vouchers", the sale-day banner on Home, and the deals on a store's menu.
 */

const actorOf = (req: Request) => ({ userId: req.session!.userId, name: req.session!.name });
const n = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 14:00.")
  .transform((v) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3)));

const promoFields = {
  title: z.string("Give it a name people will understand.").trim().min(3, "Give it a name people will understand.").max(60, "60 characters at most."),
  benefit: z.enum(["PERCENT_OFF", "AMOUNT_OFF", "FREE_DELIVERY", "DELIVERY_OFF"], "Choose what it takes off."),
  value: z.number("Enter how much it takes off.").min(0).max(100000),
  maxDiscount: z.number().positive("Enter more than ₱0.").max(100000).nullish().transform((v) => v ?? null),
  minSpend: z.number().min(0).max(100000).optional().default(0),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).nullish(),
  dailyFrom: time.nullish(),
  dailyTo: time.nullish(),
  perUserLimit: z.number().int().min(1, "At least once.").max(50).optional().default(1),
  totalLimit: z.number().int().min(1).max(100000).nullish().transform((v) => v ?? null),
  isPublic: z.boolean().optional().default(true),
  campaignId: z.string().min(1).nullish().transform((v) => v ?? null),
};
const code = z
  .string("Give it a code people type, like PASKO50.")
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, "Use 3 to 20 letters and numbers, like PASKO50.");

type PromoInput = { benefit: string; value: number; startsAt?: string; endsAt?: string | null; dailyFrom?: number | null; dailyTo?: number | null };

/** The checks every promo needs, whoever makes it */
function checkPromo(input: PromoInput, deal: boolean) {
  const problems: Record<string, string[]> = {};
  if (input.benefit === "PERCENT_OFF" && (input.value <= 0 || input.value > (deal ? 90 : 100))) problems.value = [`Enter 1 to ${deal ? 90 : 100}%.`];
  if ((input.benefit === "AMOUNT_OFF" || input.benefit === "DELIVERY_OFF") && input.value <= 0) problems.value = ["Enter more than ₱0."];
  if (deal && (input.benefit === "FREE_DELIVERY" || input.benefit === "DELIVERY_OFF")) problems.benefit = ["A deal takes off the dishes' price. For free delivery, make a voucher."];
  if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt ?? Date.now())) problems.endsAt = ["The end must be after the start."];
  if ((input.dailyFrom == null) !== (input.dailyTo == null)) problems.dailyTo = ["Set both times, or neither."];
  if (input.dailyFrom != null && input.dailyFrom === input.dailyTo) problems.dailyTo = ["The end must differ from the start."];
  if (Object.keys(problems).length) throw new ValidationError(problems);
}

const dates = (input: { startsAt?: string; endsAt?: string | null }) => ({ startsAt: input.startsAt ? new Date(input.startsAt) : new Date(), endsAt: input.endsAt ? new Date(input.endsAt) : null });

/** A promo with its uses and costs, for the lists */
async function withNumbers<T extends { id: string; budget: Prisma.Decimal | null; value: Prisma.Decimal; maxDiscount: Prisma.Decimal | null; minSpend: Prisma.Decimal; dailyFrom: number | null; dailyTo: number | null }>(promos: T[]) {
  return Promise.all(
    promos.map(async (p) => {
      const [uses, spent, totals] = await Promise.all([
        liveUses(prisma, p.id),
        liveSpend(prisma, p.id),
        prisma.$queryRaw<{ amount: string | null; store: string | null }[]>`
          SELECT sum(u.amount)::text AS amount, sum(u."storeAmount")::text AS store FROM "PromoUse" u JOIN "Order" o ON o.id = u."orderId"
          WHERE u."promoId" = ${p.id} AND o.status NOT IN ('CANCELLED', 'REJECTED')`,
      ]);
      return {
        ...p,
        value: Number(p.value),
        maxDiscount: n(p.maxDiscount),
        minSpend: Number(p.minSpend),
        budget: n(p.budget),
        hours: p.dailyFrom != null && p.dailyTo != null ? `${clock(p.dailyFrom)} to ${clock(p.dailyTo)}` : null,
        uses,
        /** Taken off in all, and what Feasto and the store each paid */
        given: Number(totals[0]?.amount ?? 0),
        feastoSpent: spent,
        storeSpent: Number(totals[0]?.store ?? 0),
      };
    }),
  );
}

const duplicateCode = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// ---------- Admin ----------

export const adminPromosRouter = Router();
adminPromosRouter.use(requireAuth, requireRole("ADMIN"));

adminPromosRouter.get("/", async (_req, res) => {
  const [promos, campaigns, storeDeals] = await Promise.all([
    prisma.promo.findMany({ where: { kind: "VOUCHER" }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], include: { vendor: { select: { name: true } }, campaign: { select: { name: true } } } }),
    prisma.campaign.findMany({ orderBy: { startsAt: "desc" }, take: 30, include: { _count: { select: { promos: true } } } }),
    prisma.promo.count({ where: { kind: "DEAL", isActive: true } }),
  ]);
  const listed = await withNumbers(promos);
  res.json({
    vouchers: listed,
    campaigns,
    storeDeals,
    stores: await prisma.vendor.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    totals: { feastoSpent: Math.round(listed.reduce((s, p) => s + p.feastoSpent, 0) * 100) / 100, given: Math.round(listed.reduce((s, p) => s + p.given, 0) * 100) / 100 },
  });
});

const adminVoucher = z.object({
  ...promoFields,
  code,
  vendorId: z.string().min(1).nullish().transform((v) => v ?? null),
  audience: z.enum(["EVERYONE", "FIRST_ORDER", "PLUS"]).optional().default("EVERYONE"),
  budget: z.number().positive("Enter more than ₱0.").max(10_000_000).nullish().transform((v) => v ?? null),
});

adminPromosRouter.post("/vouchers", async (req, res) => {
  const input = parseBody(adminVoucher, req.body);
  checkPromo(input, false);
  try {
    const promo = await prisma.$transaction(async (tx) => {
      const created = await tx.promo.create({
        data: { ...input, ...dates(input), kind: "VOUCHER", funder: "FEASTO", createdById: req.session!.userId },
      });
      await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Made a voucher", target: `${input.code} · ${input.title}` });
      return created;
    });
    res.status(201).json({ promo: { id: promo.id } });
  } catch (error) {
    if (duplicateCode(error)) throw new ValidationError({ code: ["That code is already used. Choose another."] });
    throw error;
  }
});

/** Pause or resume (a promo already used is never deleted, so its numbers stay) */
const pauseSchema = z.object({ isActive: z.boolean() });
adminPromosRouter.patch("/vouchers/:id", async (req, res) => {
  const { isActive } = parseBody(pauseSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const p = await tx.promo.findFirst({ where: { id: String(req.params.id), kind: "VOUCHER" } });
    if (!p) throw new HttpError(404, "That voucher isn't there anymore.");
    await tx.promo.update({ where: { id: p.id }, data: { isActive } });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: isActive ? "Resumed a voucher" : "Paused a voucher", target: `${p.code} · ${p.title}` });
  });
  res.json({ ok: true });
});

const campaignSchema = z.object({
  name: z.string("Name the sale.").trim().min(3, "Name the sale, like 12.12 Sale.").max(40),
  tagline: z.string().trim().max(100).optional().transform((v) => v || null),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
});
adminPromosRouter.post("/campaigns", async (req, res) => {
  const input = parseBody(campaignSchema, req.body);
  if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new ValidationError({ endsAt: ["The end must be after the start."] });
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.campaign.create({ data: { ...input, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt) } });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Set up a sale day", target: input.name });
    return created;
  });
  res.status(201).json({ campaign });
});

// ---------- Stores ----------

export const vendorPromosRouter = Router();
vendorPromosRouter.use(requireAuth, requireRole("VENDOR"));

vendorPromosRouter.get("/promos", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const [promos, menu, campaigns] = await Promise.all([
    prisma.promo.findMany({ where: { vendorId }, orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], include: { campaign: { select: { name: true } } } }),
    prisma.menuItem.findMany({ where: { vendorId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, price: true } }),
    prisma.campaign.findMany({ where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, select: { id: true, name: true, startsAt: true, endsAt: true } }),
  ]);
  res.json({ promos: await withNumbers(promos), menu: menu.map((m) => ({ ...m, price: Number(m.price) })), campaigns });
});

const storePromo = z.object({
  ...promoFields,
  kind: z.enum(["DEAL", "VOUCHER"]),
  code: code.optional(),
  menuItemIds: z.array(z.string().min(1)).max(200).optional().default([]),
});

vendorPromosRouter.post("/promos", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const input = parseBody(storePromo, req.body);
  checkPromo(input, input.kind === "DEAL");
  if (input.kind === "VOUCHER" && !input.code) throw new ValidationError({ code: ["Give it a code people type, like PASKO50."] });
  if (input.menuItemIds.length) {
    const mine = await prisma.menuItem.count({ where: { id: { in: input.menuItemIds }, vendorId, deletedAt: null } });
    if (mine !== input.menuItemIds.length) throw new ValidationError({ menuItemIds: ["Choose dishes from your own menu."] });
  }
  const { kind, code: promoCode, ...rest } = input;
  try {
    const promo = await prisma.$transaction(async (tx) => {
      const created = await tx.promo.create({
        data: {
          ...rest,
          ...dates(input),
          kind,
          code: kind === "VOUCHER" ? promoCode! : null,
          vendorId,
          // The store's promo is the store's to pay; a deal is for everyone, any number of times
          funder: "STORE",
          perUserLimit: kind === "DEAL" ? 1000 : rest.perUserLimit,
          menuItemIds: kind === "DEAL" ? rest.menuItemIds : [],
          createdById: req.session!.userId,
        },
      });
      await logActivity(tx, actorOf(req), { category: "SETTINGS", action: kind === "DEAL" ? "Started a deal" : "Made a store voucher", target: input.title });
      return created;
    });
    res.status(201).json({ promo: { id: promo.id } });
  } catch (error) {
    if (duplicateCode(error)) throw new ValidationError({ code: ["That code is already used. Choose another."] });
    throw error;
  }
});

vendorPromosRouter.patch("/promos/:id", async (req, res) => {
  const vendorId = await myVendorId(req.session!.userId);
  const { isActive } = parseBody(pauseSchema, req.body);
  const { count } = await prisma.promo.updateMany({ where: { id: String(req.params.id), vendorId }, data: { isActive } });
  if (count === 0) throw new HttpError(404, "That deal isn't there anymore.");
  res.json({ ok: true });
});

// ---------- Residents ----------

export const residentPromosRouter = Router();
residentPromosRouter.use(requireAuth, requireRole("RESIDENT"));

/** "My vouchers": the ones to use now, the ones coming on a sale day, and the used ones */
residentPromosRouter.get("/vouchers", async (req, res) => {
  res.json({ vouchers: await vouchersFor(req.session!.userId) });
});

/** The sale day on now (or the next one, within a week), for the banner on Home */
residentPromosRouter.get("/campaign", async (req, res) => {
  const now = new Date();
  const campaign = await prisma.campaign.findFirst({
    where: { endsAt: { gt: now }, startsAt: { lt: new Date(now.getTime() + 7 * 86400_000) } },
    orderBy: { startsAt: "asc" },
    select: { id: true, name: true, tagline: true, startsAt: true, endsAt: true },
  });
  if (!campaign) return void res.json({ campaign: null });
  const vouchers = (await vouchersFor(req.session!.userId, now)).filter((v) => v.campaign === campaign.name);
  res.json({ campaign: { ...campaign, live: campaign.startsAt <= now, vouchers } });
});

/** The deals on a store's menu right now, by dish: the price after the deal */
residentPromosRouter.get("/stores/:id/deals", async (req, res) => {
  const storeId = String(req.params.id);
  const deals = await dealsNow(prisma, [storeId]);
  if (!deals.length) return void res.json({ deals: [], items: {} });
  const menu = await prisma.menuItem.findMany({ where: { vendorId: storeId, deletedAt: null }, select: { id: true, price: true } });
  const items: Record<string, { label: string; price: number }> = {};
  for (const m of menu) {
    const best = bestDeal(deals, { menuItemId: m.id, price: Number(m.price), quantity: 1 });
    if (best) items[m.id] = { label: best.deal.title, price: Math.round((Number(m.price) - best.amount) * 100) / 100 };
  }
  res.json({
    deals: deals.map((d) => ({ id: d.id, title: d.title, hours: d.dailyFrom != null && d.dailyTo != null ? `${clock(d.dailyFrom)} to ${clock(d.dailyTo)}` : null, endsAt: d.endsAt })),
    items,
  });
});
