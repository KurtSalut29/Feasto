import { Prisma, type Promo } from "../generated/prisma/client.js";
import { prisma } from "./db.js";

/**
 * The promo engine: what comes off a checkout, worked out here on the server only and to the
 * centavo, then copied onto each order with who pays for it.
 *
 * The order of the sums (like Shopee's): each dish's store deal → one voucher (Feasto's or a
 * store's) → one delivery voucher. A deal is the store's; a voucher says who pays (Feasto, the
 * store, or shared); the rider always gets the whole delivery fee, so free delivery is paid by
 * whoever gives it.
 *
 * The Senior Citizen and PWD discount (RA 9994, RA 10754) can't be added to other promos: the
 * resident gets whichever takes off more, as the law says. It's 20% off one serving (the most
 * expensive dish) of each store's order, paid by the store.
 *
 * A voucher's uses and budget are counted from the orders that are still alive, so a cancelled,
 * declined or unpaid order gives the voucher back by itself.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type DiscountKind = "DEAL" | "VOUCHER" | "DELIVERY" | "FIRST_ORDER" | "SENIOR";
export type DiscountLine = { kind: DiscountKind; label: string; amount: number; store: number; feasto: number; promoId?: string };

export type PromoGroup = {
  storeId: string;
  storeName: string;
  items: { menuItemId: string; name: string; price: number; quantity: number }[];
  subtotal: number;
  deliveryFee: number;
};

export type GroupPricing = {
  storeId: string;
  /** Off each dish's line (deal or Senior/PWD), by menu item */
  itemDiscounts: Record<string, number>;
  lines: DiscountLine[];
  storeDiscount: number;
  feastoDiscount: number;
  discount: number;
  senior: boolean;
};

export type VoucherState = { code: string; title: string; applied: boolean; message: string | null; amount: number };

export type Pricing = {
  groups: GroupPricing[];
  discount: number;
  voucher: VoucherState | null;
  deliveryVoucher: VoucherState | null;
  senior: { eligible: boolean; kind: "SENIOR" | "PWD" | null; requested: boolean; applied: boolean; message: string | null };
};

const c = (n: number) => Math.round(n * 100) / 100;
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Minutes after midnight in Manila */
export function manilaMinutes(at: Date) {
  const [h, m] = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Manila" }).split(":").map(Number);
  return (h! % 24) * 60 + m!;
}

const inWindow = (p: Pick<Promo, "dailyFrom" | "dailyTo">, at: Date) => {
  if (p.dailyFrom == null || p.dailyTo == null) return true;
  const now = manilaMinutes(at);
  return p.dailyFrom <= p.dailyTo ? now >= p.dailyFrom && now < p.dailyTo : now >= p.dailyFrom || now < p.dailyTo;
};

type WithCampaign = Promo & { campaign: { name: string; startsAt: Date; endsAt: Date } | null; vendor?: { name: string } | null };

/** Why a promo can't be used at this moment, or null */
export function timingProblem(p: WithCampaign, at: Date): string | null {
  if (!p.isActive) return "This voucher isn't available anymore.";
  const start = p.campaign && p.campaign.startsAt > p.startsAt ? p.campaign.startsAt : p.startsAt;
  const end = p.campaign && (!p.endsAt || p.campaign.endsAt < p.endsAt) ? p.campaign.endsAt : p.endsAt;
  if (start > at) return `This voucher starts ${start.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}.`;
  if (end && end <= at) return "This voucher has expired.";
  if (!inWindow(p, at)) return `This voucher works only from ${clock(p.dailyFrom!)} to ${clock(p.dailyTo!)}.`;
  return null;
}
export const clock = (minutes: number) => new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

const LIVE = Prisma.sql`o.status NOT IN ('CANCELLED', 'REJECTED')`;

/** Checkouts a promo is on that are still alive (all, or one resident's) */
export async function liveUses(db: Db, promoId: string, userId?: string) {
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(DISTINCT o."checkoutId") AS n FROM "PromoUse" u JOIN "Order" o ON o.id = u."orderId"
    WHERE u."promoId" = ${promoId} AND ${LIVE} ${userId ? Prisma.sql`AND u."userId" = ${userId}` : Prisma.empty}`;
  return Number(row?.n ?? 0);
}

/** What Feasto has spent on a promo, on orders still alive */
export async function liveSpend(db: Db, promoId: string) {
  const [row] = await db.$queryRaw<{ s: string | null }[]>`
    SELECT sum(u."feastoAmount")::text AS s FROM "PromoUse" u JOIN "Order" o ON o.id = u."orderId" WHERE u."promoId" = ${promoId} AND ${LIVE}`;
  return num(row?.s ? Number(row.s) : 0);
}

/** A voucher is weighed by one checkout at a time, so two can't both take its last use or peso */
const lockPromo = (db: Db, promoId: string) => db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${promoId}))`;

/** Whether this resident (and their phone and device) may still use a first-order voucher */
async function firstOrderProblem(db: Db, userId: string, deviceHash: string | null) {
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { idStatus: true, phone: true } });
  if (me.idStatus !== "VERIFIED") return "The first-order voucher needs a verified ID. The admin is still checking yours.";
  const ordered = await db.order.count({ where: { checkout: { residentId: userId }, status: { notIn: ["CANCELLED", "REJECTED"] } } });
  if (ordered > 0) return "This voucher is for your first order.";
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "PromoUse" u
      JOIN "Promo" p ON p.id = u."promoId" AND p.audience = 'FIRST_ORDER'
      JOIN "Order" o ON o.id = u."orderId" AND ${LIVE}
      JOIN "User" x ON x.id = u."userId"
    WHERE u."userId" <> ${userId} AND (
      (${me.phone}::text IS NOT NULL AND x.phone = ${me.phone})
      OR (${deviceHash}::text IS NOT NULL AND EXISTS (SELECT 1 FROM "KnownDevice" d WHERE d."userId" = x.id AND d."deviceHash" = ${deviceHash}))
    )`;
  if (Number(row?.n ?? 0) > 0) return "A first-order voucher was already used with this phone number or device.";
  return null;
}

const promoInclude = { campaign: { select: { name: true, startsAt: true, endsAt: true } }, vendor: { select: { name: true } } } as const;

/** Splits an amount over groups by weight, to the centavo (the last takes what's left) */
function split(amount: number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  let left = c(amount);
  return weights.map((w, i) => {
    if (i === weights.length - 1) return c(left);
    const part = c((amount * w) / total);
    left = c(left - part);
    return part;
  });
}

const funded = (p: Promo, amount: number) => {
  const store = p.funder === "STORE" ? amount : p.funder === "SPLIT" ? c((amount * p.storeShare) / 100) : 0;
  return { store, feasto: c(amount - store) };
};

const isDelivery = (p: Pick<Promo, "benefit">) => p.benefit === "FREE_DELIVERY" || p.benefit === "DELIVERY_OFF";

export type PriceInput = {
  userId: string;
  groups: PromoGroup[];
  fulfillment: "DELIVERY" | "PICKUP";
  voucherCode?: string | null;
  deliveryCode?: string | null;
  senior?: boolean;
  at?: Date;
  deviceHash?: string | null;
  /** In the checkout's transaction: hold each voucher while its uses are counted */
  lock?: boolean;
};

/** Every store deal on now, for these stores */
export async function dealsNow(db: Db, storeIds: string[], at = new Date()) {
  const deals = await db.promo.findMany({ where: { kind: "DEAL", isActive: true, vendorId: { in: storeIds }, startsAt: { lte: at }, OR: [{ endsAt: null }, { endsAt: { gt: at } }] }, include: promoInclude });
  return deals.filter((d) => !timingProblem(d, at));
}

/** One dish's best deal: what it takes off the line, and which */
export function bestDeal(deals: Promo[], item: { menuItemId: string; price: number; quantity: number }) {
  let best: { amount: number; deal: Promo } | null = null;
  for (const d of deals) {
    if (d.menuItemIds.length && !d.menuItemIds.includes(item.menuItemId)) continue;
    const line = item.price * item.quantity;
    let amount = d.benefit === "PERCENT_OFF" ? (line * num(d.value)) / 100 : d.benefit === "AMOUNT_OFF" ? Math.min(num(d.value), item.price) * item.quantity : 0;
    if (d.maxDiscount != null) amount = Math.min(amount, num(d.maxDiscount));
    amount = c(Math.min(amount, line));
    if (amount > 0 && (!best || amount > best.amount)) best = { amount, deal: d };
  }
  return best;
}

/** What a checkout costs after its promos. The same sums for the cart page and the checkout itself. */
export async function pricePromos(db: Db, input: PriceInput): Promise<Pricing> {
  const at = input.at ?? new Date();
  const delivery = input.fulfillment === "DELIVERY";
  const deals = await dealsNow(db, input.groups.map((g) => g.storeId), at);

  // 1. Each dish's best deal (the store's)
  const withDeals = input.groups.map((g) => {
    const itemDiscounts: Record<string, number> = {};
    const lines: DiscountLine[] = [];
    for (const item of g.items) {
      const best = bestDeal(deals.filter((d) => d.vendorId === g.storeId), item);
      if (!best) continue;
      itemDiscounts[item.menuItemId] = best.amount;
      const same = lines.find((l) => l.promoId === best.deal.id);
      if (same) {
        same.amount = c(same.amount + best.amount);
        same.store = same.amount;
      } else lines.push({ kind: "DEAL", label: best.deal.title, amount: best.amount, store: best.amount, feasto: 0, promoId: best.deal.id });
    }
    const dealTotal = c(Object.values(itemDiscounts).reduce((a, b) => a + b, 0));
    return { group: g, itemDiscounts, lines, base: c(g.subtotal - dealTotal) };
  });

  // 2. The vouchers
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId }, select: { idType: true, idStatus: true } });
  const vouchers: { state: VoucherState; promo: WithCampaign | null; amounts: number[] }[] = [];
  for (const [slot, code] of [["items", input.voucherCode], ["delivery", input.deliveryCode]] as const) {
    if (!code?.trim()) continue;
    const promo = await db.promo.findFirst({ where: { kind: "VOUCHER", code: { equals: code.trim(), mode: "insensitive" } }, include: promoInclude });
    const state: VoucherState = { code: code.trim().toUpperCase(), title: promo?.title ?? "", applied: false, message: null, amount: 0 };
    const fail = (message: string) => vouchers.push({ state: { ...state, message }, promo: null, amounts: [] });
    if (!promo) {
      fail("There's no voucher with that code. Check the spelling.");
      continue;
    }
    if (slot === "delivery" && !isDelivery(promo)) {
      fail("That's not a delivery voucher. Put it in the voucher box above.");
      continue;
    }
    if (slot === "items" && isDelivery(promo)) {
      fail("That's a delivery voucher. Put it in the delivery voucher box.");
      continue;
    }
    if (isDelivery(promo) && !delivery) {
      fail("Delivery vouchers are for delivery orders.");
      continue;
    }
    const timing = timingProblem(promo, at);
    if (timing) {
      fail(timing);
      continue;
    }
    if (input.lock) await lockPromo(db, promo.id);
    // Which stores it's for, and on what it's counted
    const applies = withDeals.map((w) => !promo.vendorId || w.group.storeId === promo.vendorId);
    if (!applies.some(Boolean)) {
      fail(`This voucher is for ${promo.vendor?.name ?? "another store"} only.`);
      continue;
    }
    const weights = withDeals.map((w, i) => (applies[i] ? (isDelivery(promo) ? w.group.deliveryFee : w.base) : 0));
    const spend = withDeals.reduce((n, w, i) => n + (applies[i] ? w.base : 0), 0);
    if (spend + 0.001 < num(promo.minSpend)) {
      fail(`Add ${peso(c(num(promo.minSpend) - spend))} more${promo.vendorId ? ` from ${promo.vendor?.name}` : ""} to use this voucher (minimum ${peso(num(promo.minSpend))}).`);
      continue;
    }
    if (promo.audience === "FIRST_ORDER") {
      const problem = await firstOrderProblem(db, input.userId, input.deviceHash ?? null);
      if (problem) {
        fail(problem);
        continue;
      }
    }
    if ((await liveUses(db, promo.id, input.userId)) >= promo.perUserLimit) {
      fail(promo.perUserLimit === 1 ? "You've already used this voucher." : `You've used this voucher ${promo.perUserLimit} times, the most allowed.`);
      continue;
    }
    if (promo.totalLimit != null && (await liveUses(db, promo.id)) >= promo.totalLimit) {
      fail("This voucher has been used up.");
      continue;
    }
    const pool = weights.reduce((a, b) => a + b, 0);
    let amount =
      promo.benefit === "PERCENT_OFF"
        ? (pool * num(promo.value)) / 100
        : promo.benefit === "AMOUNT_OFF"
          ? num(promo.value)
          : promo.benefit === "FREE_DELIVERY"
            ? pool
            : num(promo.value);
    if (promo.maxDiscount != null) amount = Math.min(amount, num(promo.maxDiscount));
    amount = c(Math.min(amount, pool));
    if (amount <= 0) {
      fail(isDelivery(promo) ? "There's no delivery fee to take off." : "There's nothing for this voucher to take off.");
      continue;
    }
    if (promo.budget != null && funded(promo, amount).feasto > 0 && (await liveSpend(db, promo.id)) + funded(promo, amount).feasto > num(promo.budget) + 0.001) {
      fail("This voucher has run out for now.");
      continue;
    }
    vouchers.push({ state: { ...state, title: promo.title, applied: true, amount }, promo, amounts: split(amount, weights) });
  }

  const promoPath: GroupPricing[] = withDeals.map((w, i) => {
    const lines = [...w.lines];
    for (const v of vouchers) {
      if (!v.promo || !v.amounts[i]) continue;
      const amount = v.amounts[i]!;
      const f = funded(v.promo, amount);
      const kind: DiscountKind = isDelivery(v.promo) ? "DELIVERY" : v.promo.audience === "FIRST_ORDER" ? "FIRST_ORDER" : "VOUCHER";
      lines.push({ kind, label: `${v.promo.title} (${v.state.code})`, amount, store: f.store, feasto: f.feasto, promoId: v.promo.id });
    }
    return total({ storeId: w.group.storeId, itemDiscounts: w.itemDiscounts, lines, senior: false });
  });

  // 3. Senior Citizen or PWD: instead of the promos, when it takes off more
  const kind = user.idStatus === "VERIFIED" && (user.idType === "SENIOR" || user.idType === "PWD") ? user.idType : null;
  const senior: Pricing["senior"] = { eligible: Boolean(kind), kind, requested: Boolean(input.senior), applied: false, message: null };
  let chosen = promoPath;
  if (input.senior && !kind) senior.message = "The Senior Citizen and PWD discount needs a verified Senior Citizen or PWD ID on your account.";
  if (input.senior && kind) {
    const seniorPath = withDeals.map((w) => {
      const top = [...w.group.items].sort((a, b) => b.price - a.price)[0];
      const seniorAmount = top ? c(top.price * 0.2) : 0;
      const dealsOnly = total({ storeId: w.group.storeId, itemDiscounts: w.itemDiscounts, lines: [...w.lines], senior: false });
      if (!top || seniorAmount <= dealsOnly.discount) return dealsOnly;
      const label = kind === "SENIOR" ? "Senior Citizen discount (20%, one serving)" : "PWD discount (20%, one serving)";
      return total({ storeId: w.group.storeId, itemDiscounts: { [top.menuItemId]: seniorAmount }, lines: [{ kind: "SENIOR", label, amount: seniorAmount, store: seniorAmount, feasto: 0 }], senior: true });
    });
    const seniorTotal = seniorPath.reduce((n, g) => n + g.discount, 0);
    const promoTotal = promoPath.reduce((n, g) => n + g.discount, 0);
    if (seniorTotal > promoTotal) {
      chosen = seniorPath;
      senior.applied = seniorPath.some((g) => g.senior);
      if (vouchers.some((v) => v.state.applied)) senior.message = "Your discount takes off more than the vouchers, so it's used instead. By law they can't be added together.";
      for (const v of vouchers) if (v.state.applied) Object.assign(v.state, { applied: false, amount: 0, message: "Not used: your Senior Citizen or PWD discount takes off more." });
    } else {
      senior.message = vouchers.some((v) => v.state.applied) ? "Your vouchers take off more than your discount, so they're used instead. By law they can't be added together." : "The store's deals already take off more than your discount.";
    }
  }

  return {
    groups: chosen,
    discount: c(chosen.reduce((n, g) => n + g.discount, 0)),
    voucher: vouchers.find((v) => v.state.code === input.voucherCode?.trim().toUpperCase())?.state ?? null,
    deliveryVoucher: vouchers.find((v) => v.state.code === input.deliveryCode?.trim().toUpperCase() && input.deliveryCode)?.state ?? null,
    senior,
  };
}

function total(g: { storeId: string; itemDiscounts: Record<string, number>; lines: DiscountLine[]; senior: boolean }): GroupPricing {
  const store = c(g.lines.reduce((n, l) => n + l.store, 0));
  const feasto = c(g.lines.reduce((n, l) => n + l.feasto, 0));
  return { ...g, storeDiscount: store, feastoDiscount: feasto, discount: c(store + feasto) };
}

/** The vouchers a resident can see in "My vouchers" and at checkout, with whether each works for them now */
export async function vouchersFor(userId: string, at = new Date()) {
  const promos = await prisma.promo.findMany({
    where: { kind: "VOUCHER", isPublic: true, isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: at } }] },
    include: { ...promoInclude, vendor: { select: { id: true, name: true } } },
    orderBy: [{ startsAt: "asc" }],
    take: 60,
  });
  const out = [];
  for (const p of promos) {
    if (p.campaign && p.campaign.endsAt <= at) continue;
    const [mine, all, spent] = await Promise.all([liveUses(prisma, p.id, userId), p.totalLimit != null ? liveUses(prisma, p.id) : 0, p.budget != null ? liveSpend(prisma, p.id) : 0]);
    const timing = timingProblem(p, at);
    const usedUp = mine >= p.perUserLimit;
    const gone = (p.totalLimit != null && all >= p.totalLimit) || (p.budget != null && spent >= num(p.budget) - 0.001);
    const first = p.audience === "FIRST_ORDER" && !usedUp ? await firstOrderProblem(prisma, userId, null) : null;
    out.push({
      id: p.id,
      code: p.code,
      title: p.title,
      benefit: p.benefit,
      value: num(p.value),
      maxDiscount: p.maxDiscount == null ? null : num(p.maxDiscount),
      minSpend: num(p.minSpend),
      store: p.vendor ? { id: p.vendor.id, name: p.vendor.name } : null,
      campaign: p.campaign?.name ?? null,
      startsAt: (p.campaign && p.campaign.startsAt > p.startsAt ? p.campaign.startsAt : p.startsAt).toISOString(),
      endsAt: (p.campaign && (!p.endsAt || p.campaign.endsAt < p.endsAt) ? p.campaign.endsAt : p.endsAt)?.toISOString() ?? null,
      firstOrder: p.audience === "FIRST_ORDER",
      usesLeft: Math.max(0, p.perUserLimit - mine),
      /** Why it can't be used now, or null */
      problem: usedUp ? "Used" : gone ? "Used up" : (first ?? (timing && !timing.startsWith("This voucher starts") ? timing : null)),
      upcoming: Boolean(timing?.startsWith("This voucher starts")),
    });
  }
  return out;
}

/** The lines and amounts kept on an order and its items, from one group's pricing */
export const orderDiscountData = (g: GroupPricing | undefined) =>
  g
    ? { storeDiscount: g.storeDiscount, feastoDiscount: g.feastoDiscount, discounts: g.lines as unknown as Prisma.InputJsonValue, seniorDiscount: g.senior }
    : { storeDiscount: 0, feastoDiscount: 0, discounts: [] as unknown as Prisma.InputJsonValue, seniorDiscount: false };

/** What the resident pays for one order */
export const orderTotal = (o: { subtotal: unknown; deliveryFee: unknown; storeDiscount?: unknown; feastoDiscount?: unknown; tip?: unknown }) =>
  c(Number(o.subtotal) + Number(o.deliveryFee) - Number(o.storeDiscount ?? 0) - Number(o.feastoDiscount ?? 0));
