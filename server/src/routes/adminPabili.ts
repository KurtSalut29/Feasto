import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { logActivity } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { CATEGORY_LABEL, forgetTerms, rulesIn, SHOP_CATEGORIES } from "../lib/pabili.js";
import { clearSettingsCache } from "../lib/settings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * Admin › Pabili: the shops residents choose from (by kind, barangay and landmark, no map), the
 * shops residents asked for, the words that aren't allowed or need something, and the liquor ban.
 */
export const adminPabiliRouter = Router();
adminPabiliRouter.use(requireAuth, requireRole("ADMIN"));

const actorOf = (req: Request) => ({ userId: req.session!.userId, name: req.session!.name });
const RULES = ["BANNED", "PRESCRIPTION", "ALCOHOL", "TOBACCO", "CHEMICAL", "LPG", "BULKY"] as const;

const shopSchema = z.object({
  name: z.string("Enter the shop's name.").trim().min(2, "Enter the shop's name.").max(80),
  category: z.enum(SHOP_CATEGORIES, "Choose what kind of shop it is."),
  barangay: z.string().trim().max(60).optional().transform((v) => v || null),
  landmark: z.string("Say where it is, like a street or landmark.").trim().min(3, "Say where it is, like a street or landmark.").max(200),
  hours: z.string().trim().max(80).optional().transform((v) => v || null),
  vendorId: z.string().min(1).nullish().transform((v) => v || null),
  isActive: z.boolean().optional().default(true),
});

adminPabiliRouter.get("/", async (_req, res) => {
  const [shops, suggestions, terms, settings, stores] = await Promise.all([
    prisma.pabiliShop.findMany({
      orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, barangay: true, landmark: true, hours: true, isActive: true, vendorId: true, vendor: { select: { name: true } }, _count: { select: { errands: true } } },
    }),
    prisma.pabiliShopSuggestion.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, name: true, category: true, location: true, createdAt: true, user: { select: { name: true } } } }),
    prisma.restrictedTerm.findMany({ orderBy: [{ rule: "asc" }, { term: "asc" }], select: { id: true, term: true, rule: true } }),
    prisma.platformSettings.findUnique({ where: { id: 1 }, select: { liquorBan: true } }),
    prisma.vendor.findMany({ where: { status: "APPROVED" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  res.json({
    shops: shops.map(({ _count, vendor, ...s }) => ({ ...s, storeName: vendor?.name ?? null, pabiliCount: _count.errands })),
    suggestions,
    terms,
    liquorBan: settings?.liquorBan ?? false,
    categories: CATEGORY_LABEL,
    stores,
  });
});

adminPabiliRouter.post("/shops", async (req, res) => {
  const input = parseBody(shopSchema, req.body);
  const shop = await prisma.$transaction(async (tx) => {
    const created = await tx.pabiliShop.create({ data: input });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Added a Pabili shop", target: input.name, detail: CATEGORY_LABEL[input.category] });
    return created;
  });
  res.status(201).json({ shop });
});

adminPabiliRouter.put("/shops/:id", async (req, res) => {
  const input = parseBody(shopSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.pabiliShop.updateMany({ where: { id: String(req.params.id) }, data: input });
    if (count === 0) throw new HttpError(404, "That shop isn't on the list.");
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: input.isActive ? "Changed a Pabili shop" : "Hid a Pabili shop", target: input.name });
  });
  res.json({ ok: true });
});

/** A shop a resident asked for: added to the list (with the admin's corrections), or dismissed */
adminPabiliRouter.post("/suggestions/:id/add", async (req, res) => {
  const input = parseBody(shopSchema, req.body);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.pabiliShopSuggestion.updateMany({ where: { id: String(req.params.id), status: "OPEN" }, data: { status: "ADDED" } });
    if (count === 0) throw new HttpError(409, "This suggestion was already handled.");
    await tx.pabiliShop.create({ data: input });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Added a Pabili shop a resident asked for", target: input.name });
  });
  res.status(201).json({ ok: true });
});

adminPabiliRouter.post("/suggestions/:id/dismiss", async (req, res) => {
  const { count } = await prisma.pabiliShopSuggestion.updateMany({ where: { id: String(req.params.id), status: "OPEN" }, data: { status: "DISMISSED" } });
  if (count === 0) throw new HttpError(409, "This suggestion was already handled.");
  res.json({ ok: true });
});

adminPabiliRouter.post("/terms", async (req, res) => {
  const input = parseBody(
    z.object({
      term: z
        .string()
        .trim()
        .min(2, "Enter a word or a few words.")
        .max(40, "40 characters at most.")
        .transform((v) => v.toLowerCase()),
      rule: z.enum(RULES, "Choose what happens."),
    }),
    req.body,
  );
  try {
    await prisma.$transaction(async (tx) => {
      await tx.restrictedTerm.create({ data: input });
      await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Added a Pabili word", target: input.term, detail: input.rule });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ValidationError({ term: ["That word is already on the list."] });
    throw error;
  }
  await forgetTerms();
  res.status(201).json({ ok: true });
});

adminPabiliRouter.delete("/terms/:id", async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const term = await tx.restrictedTerm.findUnique({ where: { id: String(req.params.id) } });
    if (!term) throw new HttpError(404, "That word isn't on the list.");
    await tx.restrictedTerm.delete({ where: { id: term.id } });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Removed a Pabili word", target: term.term, detail: term.rule });
  });
  await forgetTerms();
  res.json({ ok: true });
});

/** Try a list against the words, as the resident's form would */
adminPabiliRouter.post("/terms/try", async (req, res) => {
  const { text } = parseBody(z.object({ text: z.string().max(500) }), req.body);
  const terms = await prisma.restrictedTerm.findMany({ select: { term: true, rule: true } });
  res.json({ matches: rulesIn(text, terms) });
});

adminPabiliRouter.put("/liquor-ban", async (req, res) => {
  const { on } = parseBody(z.object({ on: z.boolean() }), req.body);
  await prisma.$transaction(async (tx) => {
    await tx.platformSettings.upsert({ where: { id: 1 }, create: { id: 1, liquorBan: on }, update: { liquorBan: on } });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: on ? "Turned on the liquor ban" : "Lifted the liquor ban", target: "Pabili" });
  });
  await clearSettingsCache();
  res.json({ ok: true });
});
