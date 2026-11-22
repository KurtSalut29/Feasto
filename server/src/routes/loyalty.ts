import { Router } from "express";
import { z } from "zod";
import { logActivity } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { checkRewards, inviterOf, referralProblem, sukiFor } from "../lib/loyalty.js";
import { getSettings } from "../lib/settings.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** Suki for residents: points, tier, missions, inviting friends and the birthday gift */
export const loyaltyRouter = Router();
loyaltyRouter.use(requireAuth, requireRole("RESIDENT"));

loyaltyRouter.get("/", async (req, res) => {
  res.json(await sukiFor(req.session!.userId));
});

/** A new resident adds the friend's code they forgot at sign-up (before their first order) */
loyaltyRouter.post("/referral", async (req, res) => {
  const { code } = parseBody(z.object({ code: z.string("Type your friend's code.").trim().min(4, "Type your friend's code.").max(20) }), req.body);
  const userId = req.session!.userId;
  const problem = await referralProblem(userId, code);
  if (problem) throw new ValidationError({ code: [problem] });
  const inviter = (await inviterOf(code))!;
  await prisma.user.updateMany({ where: { id: userId, referredById: null }, data: { referredById: inviter.id } });
  res.json({ ok: true, inviter: inviter.name.split(" ")[0] });
});

/** The birthday, set once (a verified ID is still needed for the gift) */
loyaltyRouter.put("/birthday", async (req, res) => {
  const { date } = parseBody(z.object({ date: z.iso.date("Pick your birthday.") }), req.body);
  const day = new Date(`${date}T00:00:00Z`);
  const age = (Date.now() - day.getTime()) / (365.25 * 86400_000);
  if (age < 5 || age > 120) throw new ValidationError({ date: ["Pick your real birthday."] });
  const userId = req.session!.userId;
  const { count } = await prisma.user.updateMany({ where: { id: userId, birthDate: null }, data: { birthDate: day } });
  if (count === 0) throw new HttpError(409, "Your birthday is already saved. Ask the admin if it's wrong.");
  await checkRewards(userId);
  res.json({ ok: true });
});

// ---------- The admin's side ----------

export const adminLoyaltyRouter = Router();
adminLoyaltyRouter.use(requireAuth, requireRole("ADMIN"));

const missionSchema = z.object({
  title: z.string("Name the mission.").trim().min(4, "Name the mission, e.g. Order 3 times this week.").max(80),
  kind: z.enum(["ORDERS", "NEW_STORES", "SPEND"], "Choose what's counted."),
  target: z.number("Enter how many.").int("Whole numbers only.").min(1, "At least 1.").max(100000),
  period: z.enum(["WEEK", "MONTH"], "Choose the week or the month."),
  rewardPoints: z.number("Enter the points.").int("Whole points.").min(1, "At least 1 point.").max(10000, "At most 10,000 points."),
});

/** Missions, and what Suki has cost Feasto */
adminLoyaltyRouter.get("/", async (_req, res) => {
  const settings = await getSettings();
  const [missions, grants, used, earned] = await Promise.all([
    prisma.mission.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.pointsGrant.groupBy({ by: ["reason"], _sum: { points: true }, _count: true }),
    prisma.$queryRaw<{ p: bigint | null; pesos: string | null }[]>`
      SELECT sum(o."pointsUsed") AS p, sum((SELECT sum((l->>'amount')::numeric) FROM jsonb_array_elements(o.discounts) l WHERE l->>'kind' = 'POINTS'))::text AS pesos
      FROM "Order" o WHERE o.status NOT IN ('CANCELLED', 'REJECTED') AND o."pointsUsed" > 0`,
    prisma.$queryRaw<{ p: bigint | null }[]>`SELECT sum("pointsEarned") AS p FROM "Order" WHERE status IN ('DELIVERED', 'COMPLETED')`,
  ]);
  const given = grants.reduce((n, g) => n + (g._sum.points ?? 0), 0);
  const spent = Number(used[0]?.p ?? 0);
  const outstanding = Math.max(0, Number(earned[0]?.p ?? 0) + given - spent);
  res.json({
    on: settings.loyaltyOn,
    pointValue: settings.pointValue,
    missions,
    totals: {
      earned: Number(earned[0]?.p ?? 0),
      given,
      byReason: Object.fromEntries(grants.map((g) => [g.reason, { points: g._sum.points ?? 0, count: g._count }])),
      spent,
      spentPesos: Math.round(Number(used[0]?.pesos ?? 0) * 100) / 100,
      outstanding,
      outstandingPesos: Math.round(outstanding * settings.pointValue * 100) / 100,
    },
  });
});

adminLoyaltyRouter.post("/missions", async (req, res) => {
  const input = parseBody(missionSchema, req.body);
  const mission = await prisma.$transaction(async (tx) => {
    const m = await tx.mission.create({ data: input });
    await logActivity(tx, { userId: req.session!.userId, name: req.session!.name }, { category: "SETTINGS", action: "Started a Suki mission", target: m.title, detail: `${m.rewardPoints} points` });
    return m;
  });
  res.status(201).json({ mission });
});

adminLoyaltyRouter.patch("/missions/:id", async (req, res) => {
  const { isActive } = parseBody(z.object({ isActive: z.boolean() }), req.body);
  const { count } = await prisma.mission.updateMany({ where: { id: String(req.params.id) }, data: { isActive } });
  if (!count) throw new HttpError(404, "That mission isn't there anymore.");
  res.json({ ok: true });
});
