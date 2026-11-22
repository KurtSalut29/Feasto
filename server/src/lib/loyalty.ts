import { randomInt } from "node:crypto";
import { Prisma, type MissionPeriod, type PointsReason } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { notify } from "./liveUpdates.js";
import { getSettings, type Settings } from "./settings.js";

/**
 * Suki: what Feasto gives back to residents who keep ordering.
 *
 * - Points: one for every ₱20 of food paid (after discounts), more for Silver and Gold, counted once
 *   the order is delivered or collected. They're spent at checkout (100 points = ₱20 off by default),
 *   at most half the food, and Feasto pays for them: the store still gets its full price. A cancelled
 *   order gives its points back, the same way vouchers come back.
 * - Tiers, from the last 30 days: Bronze, Silver from 4 orders (1.25× points), Gold from 10 (1.5×).
 * - Missions the admin sets ("Order 3 times this week"), counted from orders, paid in points.
 * - Inviting friends: both get points when the friend's first order arrives, if the friend has a
 *   verified ID and a different phone and device. At most 10 a month for one inviter.
 * - A birthday gift in the resident's birthday week (verified ID needed).
 *
 * Balances are worked out from the orders and the grants, never kept as a running number that could
 * drift: points earned on delivered orders + points given − points spent on orders still alive.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const TIERS = [
  { name: "Gold", from: 10, multiplier: 1.5 },
  { name: "Silver", from: 4, multiplier: 1.25 },
  { name: "Bronze", from: 0, multiplier: 1 },
] as const;
export type TierName = (typeof TIERS)[number]["name"];

const REFERRALS_PER_MONTH = 10;
/** A new account can still add an inviter's code for this long, if it hasn't ordered yet */
export const REFERRAL_DAYS = 14;
const BIRTHDAY_WINDOW_DAYS = 3;

const c = (n: number) => Math.round(n * 100) / 100;
const MANILA = 8 * 3600_000;

// ---------- Balance and tier ----------

export async function pointsBalance(db: Db, userId: string) {
  const [row] = await db.$queryRaw<{ earned: bigint | null; pending: bigint | null; used: bigint | null; granted: bigint | null }[]>`
    SELECT
      (SELECT sum(o."pointsEarned") FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId" WHERE k."residentId" = ${userId} AND o.status IN ('DELIVERED', 'COMPLETED')) AS earned,
      (SELECT sum(o."pointsEarned") FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId" WHERE k."residentId" = ${userId} AND o.status NOT IN ('DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED')) AS pending,
      (SELECT sum(o."pointsUsed") FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId" WHERE k."residentId" = ${userId} AND o.status NOT IN ('CANCELLED', 'REJECTED')) AS used,
      (SELECT sum(g.points) FROM "PointsGrant" g WHERE g."userId" = ${userId}) AS granted`;
  const earned = Number(row?.earned ?? 0);
  const granted = Number(row?.granted ?? 0);
  const used = Number(row?.used ?? 0);
  return { balance: Math.max(0, earned + granted - used), pending: Number(row?.pending ?? 0), earned, granted, used };
}

/** Orders delivered or collected in the last 30 days, and the tier they make */
export async function tierOf(db: Db, userId: string, now = new Date()) {
  const orders = await db.order.count({
    where: { checkout: { residentId: userId }, status: { in: ["DELIVERED", "COMPLETED"] }, finishedAt: { gte: new Date(now.getTime() - 30 * 86400_000) } },
  });
  const tier = TIERS.find((t) => orders >= t.from)!;
  const next = [...TIERS].reverse().find((t) => t.from > orders) ?? null;
  return { name: tier.name as TierName, multiplier: tier.multiplier, orders30: orders, next: next ? { name: next.name as TierName, at: next.from } : null };
}

/** Points one order earns for this much food paid */
export const pointsFor = (foodPaid: number, multiplier: number, settings: Pick<Settings, "pointsEarnPer" | "loyaltyOn">) =>
  settings.loyaltyOn && foodPaid > 0 ? Math.floor((foodPaid / settings.pointsEarnPer) * multiplier) : 0;

/** One checkout at a time spends a resident's points, so two can't spend the same ones */
export const lockPoints = (db: Db, userId: string) => db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`points:${userId}`}))`;

// ---------- Periods (Manila time) ----------

/** This week (from Monday) or this month, in Manila: where it starts and ends, and a key for it */
export function periodOf(period: MissionPeriod, now = new Date()) {
  const ph = new Date(now.getTime() + MANILA);
  const y = ph.getUTCFullYear();
  const m = ph.getUTCMonth();
  const d = ph.getUTCDate();
  let start: Date;
  let end: Date;
  if (period === "WEEK") {
    const back = (ph.getUTCDay() + 6) % 7; // days since Monday
    start = new Date(Date.UTC(y, m, d - back) - MANILA);
    end = new Date(start.getTime() + 7 * 86400_000);
  } else {
    start = new Date(Date.UTC(y, m, 1) - MANILA);
    end = new Date(Date.UTC(y, m + 1, 1) - MANILA);
  }
  return { start, end, key: `${period}:${new Date(start.getTime() + MANILA).toISOString().slice(0, 10)}` };
}

// ---------- Missions ----------

const LIVE_DONE = Prisma.sql`o.status IN ('DELIVERED', 'COMPLETED')`;

/** How far a resident is on one mission this period */
async function progressOf(db: Db, userId: string, mission: { kind: string; period: MissionPeriod }, now = new Date()) {
  const { start, end } = periodOf(mission.period, now);
  if (mission.kind === "ORDERS") {
    const [r] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT o."checkoutId") AS n FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId"
      WHERE k."residentId" = ${userId} AND ${LIVE_DONE} AND o."finishedAt" >= ${start} AND o."finishedAt" < ${end}`;
    return Number(r?.n ?? 0);
  }
  if (mission.kind === "NEW_STORES") {
    const [r] = await db.$queryRaw<{ n: bigint }[]>`
      SELECT count(DISTINCT o."vendorId") AS n FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId"
      WHERE k."residentId" = ${userId} AND ${LIVE_DONE} AND o."finishedAt" >= ${start} AND o."finishedAt" < ${end}
        AND NOT EXISTS (
          SELECT 1 FROM "Order" p JOIN "Checkout" q ON q.id = p."checkoutId"
          WHERE q."residentId" = ${userId} AND p."vendorId" = o."vendorId" AND p.status IN ('DELIVERED', 'COMPLETED') AND p."finishedAt" < ${start})`;
    return Number(r?.n ?? 0);
  }
  const [r] = await db.$queryRaw<{ s: string | null }[]>`
    SELECT sum(o.subtotal - o."storeDiscount" - o."feastoDiscount")::text AS s FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId"
    WHERE k."residentId" = ${userId} AND ${LIVE_DONE} AND o."finishedAt" >= ${start} AND o."finishedAt" < ${end}`;
  return Math.max(0, Math.floor(Number(r?.s ?? 0)));
}

export async function missionsFor(userId: string, now = new Date()) {
  const missions = await prisma.mission.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  const grants = await prisma.pointsGrant.findMany({ where: { userId, reason: "MISSION" }, select: { key: true } });
  const done = new Set(grants.map((g) => g.key));
  return Promise.all(
    missions.map(async (m) => {
      const period = periodOf(m.period, now);
      const progress = await progressOf(prisma, userId, m, now);
      return {
        id: m.id,
        title: m.title,
        kind: m.kind,
        period: m.period,
        target: m.target,
        rewardPoints: m.rewardPoints,
        progress: Math.min(progress, m.target),
        endsAt: period.end.toISOString(),
        key: `mission:${m.id}:${period.key}`,
        done: done.has(`mission:${m.id}:${period.key}`),
      };
    }),
  );
}

// ---------- Giving points ----------

/** Gives points once for one thing (the key), and tells the resident. False if it was given before. */
async function grant(userId: string, points: number, reason: PointsReason, key: string, note: string, message?: { title: string; body: string }) {
  if (points <= 0) return false;
  const { count } = await prisma.pointsGrant.createMany({ data: [{ userId, points, reason, key, note }], skipDuplicates: true });
  if (count && message) await notify(userId, { ...message, link: "/resident/suki" });
  return count > 0;
}

/** Same month in Manila */
const monthStart = (now = new Date()) => periodOf("MONTH", now).start;

/**
 * Gives a resident whatever they've earned and not got yet: finished missions, the birthday gift, and
 * (once their first order has arrived) the points for them and their inviter. Safe to call any time:
 * each gift has a key and is given once. Runs after an order arrives and when Suki is opened.
 */
export async function checkRewards(userId: string, now = new Date()) {
  const settings = await getSettings();
  if (!settings.loyaltyOn) return;
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, idStatus: true, phone: true, birthDate: true, referredById: true, createdAt: true },
  });
  if (!me || me.role !== "RESIDENT") return;

  // Missions
  for (const m of await missionsFor(userId, now)) {
    if (m.done || m.progress < m.target) continue;
    await grant(userId, m.rewardPoints, "MISSION", m.key, m.title, { title: `Mission done: +${m.rewardPoints} points`, body: `${m.title}. Use your points at checkout.` });
  }

  // Birthday week (verified ID only, so a made-up birthday can't be claimed)
  if (me.birthDate && me.idStatus === "VERIFIED" && settings.birthdayPoints > 0) {
    const ph = new Date(now.getTime() + MANILA);
    const year = ph.getUTCFullYear();
    for (const y of [year - 1, year, year + 1]) {
      const day = Date.UTC(y, me.birthDate.getUTCMonth(), me.birthDate.getUTCDate());
      const today = Date.UTC(year, ph.getUTCMonth(), ph.getUTCDate());
      if (Math.abs(today - day) <= BIRTHDAY_WINDOW_DAYS * 86400_000) {
        await grant(userId, settings.birthdayPoints, "BIRTHDAY", `birthday:${y}`, `Happy birthday from Feasto (${y})`, {
          title: `Happy birthday, ${me.name.split(" ")[0]}! 🎂`,
          body: `Here are ${settings.birthdayPoints} points from Feasto. Treat yourself this week.`,
        });
      }
    }
  }

  // Invited by a friend: both get points once this resident's first order has arrived
  if (me.referredById && settings.referralPoints > 0) await rewardReferral(me, settings, now);
}

async function rewardReferral(me: { id: string; name: string; idStatus: string | null; phone: string | null; referredById: string | null }, settings: Settings, now: Date) {
  const inviterId = me.referredById!;
  if (me.idStatus !== "VERIFIED") return;
  const arrived = await prisma.order.count({ where: { checkout: { residentId: me.id }, status: { in: ["DELIVERED", "COMPLETED"] } } });
  if (arrived === 0) return;
  const inviter = await prisma.user.findUnique({ where: { id: inviterId }, select: { id: true, name: true, phone: true, disabledAt: true } });
  if (!inviter || inviter.disabledAt) return;
  // Not the same person twice: a different phone and no shared device
  if (me.phone && inviter.phone && me.phone === inviter.phone) return;
  const [shared] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "KnownDevice" a JOIN "KnownDevice" b ON a."deviceHash" = b."deviceHash" WHERE a."userId" = ${me.id} AND b."userId" = ${inviter.id}`;
  if (Number(shared?.n ?? 0) > 0) return;
  const first = me.name.split(" ")[0];
  await grant(me.id, settings.referralPoints, "REFERRAL", `referred:${inviter.id}`, `Joined with ${inviter.name.split(" ")[0]}'s code`, {
    title: `+${settings.referralPoints} points for joining`,
    body: `Your first order arrived, so you and ${inviter.name.split(" ")[0]} both get points.`,
  });
  const thisMonth = await prisma.pointsGrant.count({ where: { userId: inviter.id, reason: "REFERRAL", key: { startsWith: "referral:" }, createdAt: { gte: monthStart(now) } } });
  if (thisMonth >= REFERRALS_PER_MONTH) return;
  await grant(inviter.id, settings.referralPoints, "REFERRAL", `referral:${me.id}`, `${first} joined with your code`, {
    title: `+${settings.referralPoints} points: ${first} joined`,
    body: `${first}'s first order arrived. Thanks for bringing a friend to Feasto!`,
  });
}

/** Runs the reward check without ever failing the request it follows (an order arriving) */
export const checkRewardsQuietly = (userId: string) => checkRewards(userId).catch((error) => console.error("Suki rewards check failed", error));

// ---------- Inviting friends ----------

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The resident's own code, made the first time it's asked for: their first name and 4 letters/digits */
export async function referralCodeOf(userId: string) {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true, firstName: true, name: true } });
  if (me.referralCode) return me.referralCode;
  const base = (me.firstName ?? me.name).normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6) || "FEASTO";
  for (let i = 0; i < 8; i++) {
    const code = `${base}${Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join("")}`;
    const { count } = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } }).catch(() => ({ count: 0 }));
    if (count) return code;
    const again = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
    if (again.referralCode) return again.referralCode;
  }
  throw new Error("Couldn't make a referral code");
}

/** Why this resident can't add an inviter's code now, or null */
export async function referralProblem(userId: string, code: string) {
  const me = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referredById: true, createdAt: true, referralCode: true } });
  if (me.referredById) return "You already joined with a friend's code.";
  if (Date.now() - me.createdAt.getTime() > REFERRAL_DAYS * 86400_000) return `A friend's code can be added in your first ${REFERRAL_DAYS} days only.`;
  const ordered = await prisma.order.count({ where: { checkout: { residentId: userId }, status: { notIn: ["CANCELLED", "REJECTED"] } } });
  if (ordered > 0) return "A friend's code is added before your first order.";
  const inviter = await prisma.user.findFirst({ where: { referralCode: { equals: code.trim(), mode: "insensitive" }, role: "RESIDENT", disabledAt: null }, select: { id: true } });
  if (!inviter) return "There's no Feasto account with that code. Check the spelling.";
  if (inviter.id === userId) return "That's your own code. Share it with friends instead.";
  return null;
}

export async function inviterOf(code: string) {
  return prisma.user.findFirst({ where: { referralCode: { equals: code.trim(), mode: "insensitive" }, role: "RESIDENT", disabledAt: null }, select: { id: true, name: true } });
}

/** What Suki looks like for one resident */
export async function sukiFor(userId: string) {
  await checkRewards(userId);
  const settings = await getSettings();
  const [points, tier, missions, me, grants, recent, friends] = await Promise.all([
    pointsBalance(prisma, userId),
    tierOf(prisma, userId),
    missionsFor(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { birthDate: true, idStatus: true, referredById: true, createdAt: true, referredBy: { select: { name: true } } } }),
    prisma.pointsGrant.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { points: true, note: true, createdAt: true, reason: true } }),
    prisma.order.findMany({
      where: { checkout: { residentId: userId }, OR: [{ pointsEarned: { gt: 0 } }, { pointsUsed: { gt: 0 } }] },
      orderBy: { placedAt: "desc" },
      take: 20,
      select: { id: true, status: true, pointsEarned: true, pointsUsed: true, placedAt: true, vendor: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { referredById: userId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, name: true, createdAt: true } }),
  ]);
  const rewarded = new Set((await prisma.pointsGrant.findMany({ where: { userId, key: { in: friends.map((f) => `referral:${f.id}`) } }, select: { key: true } })).map((g) => g.key));
  const history = [
    ...grants.map((g) => ({ at: g.createdAt.toISOString(), points: g.points, text: g.note, pending: false })),
    ...recent.flatMap((o) => {
      const rows = [];
      const live = !["CANCELLED", "REJECTED"].includes(o.status);
      if (o.pointsUsed > 0 && live) rows.push({ at: o.placedAt.toISOString(), points: -o.pointsUsed, text: `Used on your order from ${o.vendor.name}`, pending: false });
      if (o.pointsEarned > 0 && live) rows.push({ at: o.placedAt.toISOString(), points: o.pointsEarned, text: `From your order at ${o.vendor.name}`, pending: !["DELIVERED", "COMPLETED"].includes(o.status) });
      return rows;
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 25);
  const canJoinWithCode = !me.referredById && Date.now() - me.createdAt.getTime() <= REFERRAL_DAYS * 86400_000 && recent.length === 0 && (await prisma.order.count({ where: { checkout: { residentId: userId }, status: { notIn: ["CANCELLED", "REJECTED"] } } })) === 0;
  return {
    on: settings.loyaltyOn,
    points: { ...points, value: c(points.balance * settings.pointValue), pointValue: settings.pointValue, earnPer: settings.pointsEarnPer, minRedeem: settings.pointsMinRedeem },
    tier,
    missions: missions.map(({ key: _key, ...m }) => m),
    referral: {
      code: await referralCodeOf(userId),
      points: settings.referralPoints,
      invitedBy: me.referredBy?.name.split(" ")[0] ?? null,
      canJoinWithCode,
      friends: friends.map((f) => ({ name: f.name.split(" ")[0], joinedAt: f.createdAt.toISOString(), rewarded: rewarded.has(`referral:${f.id}`) })),
    },
    birthday: {
      date: me.birthDate ? me.birthDate.toISOString().slice(0, 10) : null,
      points: settings.birthdayPoints,
      needsId: me.idStatus !== "VERIFIED",
    },
    history,
  };
}
