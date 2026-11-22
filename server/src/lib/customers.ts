import { randomInt } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { logActivity } from "./activity.js";
import { prisma } from "./db.js";
import { HttpError, ValidationError } from "./http.js";
import { notify } from "./liveUpdates.js";

/**
 * Customers pages (Store › Customers, Admin › Customers): who keeps ordering, how much, and when
 * last, so a store or Feasto can thank its regulars or win back the ones who stopped, with a voucher
 * only they get (Promo audience SELECTED + PromoRecipient).
 *
 * Counted from orders that arrived (delivered or collected). A store sees only its own customers
 * and only what they bought from it; the admin sees everyone's orders on Feasto.
 */

/** A regular (suki): this many orders (or more) in the month */
export const REGULAR_ORDERS = 3;
const DAY = 86400_000;
const PAGE = 25;
const MANILA = 8 * 3600_000;

export type Segment = "all" | "regulars" | "new" | "lapsing";
export type Sort = "orders" | "spent" | "last";

type Row = { id: string; name: string; email: string; orders: number; total: number; before: number; spent: number; spentAll: number; first: Date; last: Date };

/** "2026-11" in Manila → when it starts and ends; null or a bad one → this month */
export function monthRange(month: string | null, now = new Date()) {
  const here = new Date(now.getTime() + MANILA);
  let y = here.getUTCFullYear();
  let m = here.getUTCMonth();
  const asked = month && /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (asked) {
    const ay = Number(asked[1]);
    const am = Number(asked[2]) - 1;
    // Only up to this month, and at most two years back
    if (ay * 12 + am <= y * 12 + m && ay * 12 + am >= y * 12 + m - 24) [y, m] = [ay, am];
  }
  const start = new Date(Date.UTC(y, m, 1) - MANILA);
  const end = new Date(Date.UTC(y, m + 1, 1) - MANILA);
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`, start, end };
}

/** The last 12 months to choose from, newest first */
function monthChoices(now = new Date()) {
  const here = new Date(now.getTime() + MANILA);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(here.getUTCFullYear(), here.getUTCMonth() - i, 1));
    return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: "UTC" }) };
  });
}

/** Who the list is for: one store's orders, or all of Feasto's */
const scope = (vendorId: string | null) => (vendorId ? Prisma.sql`AND o."vendorId" = ${vendorId}` : Prisma.empty);
/** What a customer paid: for a store, its food after discounts; for Feasto, the whole order */
const paid = (vendorId: string | null) =>
  vendorId ? Prisma.sql`o.subtotal - o."storeDiscount" - o."feastoDiscount"` : Prisma.sql`o.subtotal - o."storeDiscount" - o."feastoDiscount" + o."deliveryFee"`;

/**
 * One month's customers. Each one's numbers are counted up to the month's end:
 *   orders / spent: in the month;  total / spentAll / first / last: everything up to then.
 * Groups: regulars (3+ orders in the month), new (first order ever in the month), and
 * haven't come back (2+ orders before the month, none in it).
 */
export async function customerList(vendorId: string | null, opts: { month: string | null; segment: Segment; sort: Sort; q: string; page: number }) {
  const { key, start, end } = monthRange(opts.month);
  const inMonth = Prisma.sql`o."finishedAt" >= ${start} AND o."finishedAt" < ${end}`;
  const counted = Prisma.sql`
    SELECT k."residentId" AS id,
      count(*)::int AS total,
      (count(*) FILTER (WHERE o."finishedAt" < ${start}))::int AS before,
      (count(*) FILTER (WHERE ${inMonth}))::int AS orders,
      coalesce(round(sum(${paid(vendorId)}) FILTER (WHERE ${inMonth}), 2), 0)::float8 AS spent,
      round(sum(${paid(vendorId)}), 2)::float8 AS "spentAll",
      min(o."finishedAt") AS first, max(o."finishedAt") AS last
    FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId" JOIN "User" u ON u.id = k."residentId"
    WHERE o.status IN ('DELIVERED', 'COMPLETED') AND o."finishedAt" IS NOT NULL AND o."finishedAt" < ${end} AND u.role = 'RESIDENT' ${scope(vendorId)}
    GROUP BY k."residentId"`;
  const group =
    opts.segment === "regulars"
      ? Prisma.sql`a.orders >= ${REGULAR_ORDERS}`
      : opts.segment === "new"
        ? Prisma.sql`a.first >= ${start}`
        : opts.segment === "lapsing"
          ? Prisma.sql`a.orders = 0 AND a.before >= 2`
          : Prisma.sql`a.orders > 0`;
  const search = opts.q ? Prisma.sql`AND u.name ILIKE ${`%${opts.q.replace(/[%_\\]/g, "")}%`}` : Prisma.empty;
  const order = opts.sort === "spent" ? Prisma.sql`a.spent DESC, a."spentAll" DESC` : opts.sort === "last" ? Prisma.sql`a.last DESC` : Prisma.sql`a.orders DESC, a.total DESC, a.spent DESC`;
  const listed = Prisma.sql`SELECT a.*, u.name, u.email FROM (${counted}) a JOIN "User" u ON u.id = a.id WHERE ${group} ${search}`;

  const [rows, [count], [summary]] = await Promise.all([
    prisma.$queryRaw<Row[]>`${listed} ORDER BY ${order} LIMIT ${PAGE} OFFSET ${(opts.page - 1) * PAGE}`,
    prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM (${listed}) x`,
    prisma.$queryRaw<{ customers: number; repeat: number; regulars: number; fresh: number; lapsing: number; spent: number | null }[]>`
      SELECT (count(*) FILTER (WHERE orders > 0))::int AS customers,
        (count(*) FILTER (WHERE orders >= 2))::int AS repeat,
        (count(*) FILTER (WHERE orders >= ${REGULAR_ORDERS}))::int AS regulars,
        (count(*) FILTER (WHERE first >= ${start}))::int AS fresh,
        (count(*) FILTER (WHERE orders = 0 AND before >= 2))::int AS lapsing,
        sum(spent)::float8 AS spent
      FROM (${counted}) a`,
  ]);

  // Each one's favourite: the dish they order most from this store, or (for Feasto) the store
  const ids = rows.map((r) => r.id);
  const favourites = ids.length
    ? vendorId
      ? await prisma.$queryRaw<{ id: string; name: string }[]>`
          SELECT DISTINCT ON (k."residentId") k."residentId" AS id, i.name
          FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" JOIN "Checkout" k ON k.id = o."checkoutId"
          WHERE o."vendorId" = ${vendorId} AND o.status IN ('DELIVERED', 'COMPLETED') AND i."removedAt" IS NULL AND k."residentId" IN (${Prisma.join(ids)})
          GROUP BY k."residentId", i.name ORDER BY k."residentId", sum(i.quantity) DESC`
      : await prisma.$queryRaw<{ id: string; name: string }[]>`
          SELECT DISTINCT ON (k."residentId") k."residentId" AS id, v.name
          FROM "Order" o JOIN "Checkout" k ON k.id = o."checkoutId" JOIN "Vendor" v ON v.id = o."vendorId"
          WHERE o.status IN ('DELIVERED', 'COMPLETED') AND k."residentId" IN (${Prisma.join(ids)})
          GROUP BY k."residentId", v.name ORDER BY k."residentId", count(*) DESC`
    : [];
  const favourite = new Map(favourites.map((f) => [f.id, f.name]));

  // Vouchers already given to them by this store (or Feasto) that they can still use
  // (not used by them on an order that's still alive: a cancelled order gives it back, as at checkout)
  const held = ids.length
    ? await prisma.$queryRaw<{ userId: string; n: number }[]>`
        SELECT r."userId", count(*)::int AS n
        FROM "PromoRecipient" r JOIN "Promo" p ON p.id = r."promoId"
        WHERE r."userId" IN (${Prisma.join(ids)}) AND p.audience = 'SELECTED' AND p."isActive"
          AND p."vendorId" IS NOT DISTINCT FROM ${vendorId} AND (p."endsAt" IS NULL OR p."endsAt" > ${new Date()})
          AND NOT EXISTS (
            SELECT 1 FROM "PromoUse" u JOIN "Order" o ON o.id = u."orderId"
            WHERE u."promoId" = p.id AND u."userId" = r."userId" AND o.status NOT IN ('CANCELLED', 'REJECTED'))
        GROUP BY r."userId"`
    : [];
  const holding = new Map(held.map((h) => [h.userId, h.n]));

  return {
    regularOrders: REGULAR_ORDERS,
    month: key,
    months: monthChoices(),
    summary: {
      customers: summary?.customers ?? 0,
      repeat: summary?.repeat ?? 0,
      regulars: summary?.regulars ?? 0,
      new: summary?.fresh ?? 0,
      lapsing: summary?.lapsing ?? 0,
      spent: Math.round(Number(summary?.spent ?? 0) * 100) / 100,
    },
    page: opts.page,
    pageSize: PAGE,
    total: count?.n ?? 0,
    customers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      // The admin may need to reach them; a store sees the name only
      email: vendorId ? null : r.email,
      orders: r.orders,
      total: r.total,
      spent: r.spent,
      spentAll: r.spentAll,
      average: r.orders ? Math.round((r.spent / r.orders) * 100) / 100 : 0,
      first: r.first.toISOString(),
      last: r.last.toISOString(),
      favourite: favourite.get(r.id) ?? null,
      regular: r.orders >= REGULAR_ORDERS,
      isNew: r.first >= start,
      lapsing: r.orders === 0 && r.before >= 2,
      vouchersHeld: holding.get(r.id) ?? 0,
    })),
  };
}

export type GiveInput = {
  userIds: string[];
  title: string;
  benefit: "PERCENT_OFF" | "AMOUNT_OFF" | "FREE_DELIVERY" | "DELIVERY_OFF";
  value: number;
  maxDiscount: number | null;
  minSpend: number;
  days: number;
  message: string | null;
};

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const words = (v: Pick<GiveInput, "benefit" | "value" | "maxDiscount">) =>
  v.benefit === "PERCENT_OFF"
    ? `${v.value}% off${v.maxDiscount ? ` (up to ${peso(v.maxDiscount)})` : ""}`
    : v.benefit === "AMOUNT_OFF"
      ? `${peso(v.value)} off`
      : v.benefit === "FREE_DELIVERY"
        ? `Free delivery${v.maxDiscount ? ` (up to ${peso(v.maxDiscount)})` : ""}`
        : `${peso(v.value)} off delivery`;

/** A code nobody has: FORYOU + 5 letters and numbers (no look-alikes like O/0, I/1) */
async function freshCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 10; i++) {
    const code = `FORYOU${Array.from({ length: 5 }, () => letters[randomInt(letters.length)]).join("")}`;
    if (!(await prisma.promo.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new HttpError(500, "Couldn't make a voucher code. Try again.");
}

/**
 * Gives a voucher to the customers picked: one code, usable once by each of them only, until the
 * days are up. A store's voucher is for its own store and the store pays for it; the admin's works
 * at every store and Feasto pays. Each customer is told, with the code.
 */
export async function giveVoucher(by: { userId: string; name: string }, vendor: { id: string; name: string } | null, input: GiveInput) {
  const userIds = [...new Set(input.userIds)];
  if (input.benefit === "PERCENT_OFF" && (input.value <= 0 || input.value > 100)) throw new ValidationError({ value: ["Enter 1 to 100%."] });
  if ((input.benefit === "AMOUNT_OFF" || input.benefit === "DELIVERY_OFF") && input.value <= 0) throw new ValidationError({ value: ["Enter more than ₱0."] });
  // Only real customers: a store's own (they ordered from it), or (for Feasto) any active resident who ordered
  const customers = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      role: "RESIDENT",
      disabledAt: null,
      checkouts: { some: { orders: { some: { status: { in: ["DELIVERED", "COMPLETED"] }, ...(vendor && { vendorId: vendor.id }) } } } },
    },
    select: { id: true },
  });
  if (customers.length !== userIds.length) throw new HttpError(400, vendor ? "Pick from your own customers (people who ordered from your store)." : "Pick from the customers on the list.");

  const code = await freshCode();
  const endsAt = new Date(Date.now() + input.days * DAY);
  const promo = await prisma.$transaction(async (tx) => {
    const created = await tx.promo.create({
      data: {
        kind: "VOUCHER",
        code,
        title: input.title,
        benefit: input.benefit,
        value: input.benefit === "FREE_DELIVERY" ? 0 : input.value,
        maxDiscount: input.maxDiscount,
        minSpend: input.minSpend,
        vendorId: vendor?.id ?? null,
        funder: vendor ? "STORE" : "FEASTO",
        audience: "SELECTED",
        isPublic: false,
        perUserLimit: 1,
        startsAt: new Date(),
        endsAt,
        createdById: by.userId,
      },
    });
    await tx.promoRecipient.createMany({ data: userIds.map((userId) => ({ promoId: created.id, userId })) });
    await logActivity(tx, by, {
      category: "SETTINGS",
      action: vendor ? "Gave customers a store voucher" : "Gave customers a Feasto voucher",
      target: `${input.title} (${code})`,
      detail: `${words(input)} for ${userIds.length} ${userIds.length === 1 ? "customer" : "customers"}, ${input.days} days`,
    });
    return created;
  });

  const from = vendor?.name ?? "Feasto";
  const until = endsAt.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" });
  const min = input.minSpend > 0 ? ` on ${peso(input.minSpend)} or more` : "";
  for (const id of userIds) {
    await notify(id, {
      title: `${from} sent you a voucher`,
      body: `${input.message ? `"${input.message}" ` : ""}${words(input)}${min}${vendor ? ` at ${vendor.name}` : ""}. Code ${code}, until ${until}. It's in My vouchers.`,
      link: "/resident/vouchers",
    });
  }
  return { promoId: promo.id, code, sent: userIds.length, endsAt: endsAt.toISOString() };
}
