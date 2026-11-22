import { Prisma, type Fulfillment, type PayoutChannel } from "../generated/prisma/client.js";
import { accountWords } from "./payouts.js";
import type { Settings } from "./settings.js";
import { prisma } from "./db.js";

/**
 * How Feasto earns: a commission on each order's food (paid by the store), at the rate agreed with
 * that store or the default in Settings, and a share of each Pabili fee (paid by the rider). Riders
 * keep the whole fee of a food delivery, add-ons included. Residents pay nothing extra, and tips all
 * go to the rider. (Orders from before Nov 2026 may still show a share of the delivery fee: riderCut.)
 *
 * Both are worked out at checkout and copied onto the order, like the delivery fee, so changing
 * the rates never changes an order already placed. Feasto only earns them once the order is
 * delivered or collected: cancelled, declined and refunded orders pay nothing.
 */

/** Orders Feasto earns from */
export const EARNED = ["DELIVERED", "COMPLETED"] as const;

const centavos = (value: number) => Math.round(value * 100) / 100;

type Rates = Pick<Settings, "commissionPercent" | "pickupCommissionPercent">;
/** A store's own agreed rates; empty uses the default */
export type StoreRates = { commissionPercent: number | null | { toString(): string }; pickupCommissionPercent: number | null | { toString(): string } };

const rateOf = (own: StoreRates[keyof StoreRates] | undefined, fallback: number) => (own === null || own === undefined ? fallback : Number(own));

/** The rates one store pays: its own agreement, or the default in Settings */
export function storeRates(store: StoreRates | null | undefined, rates: Rates) {
  return {
    delivery: rateOf(store?.commissionPercent, rates.commissionPercent),
    pickup: rateOf(store?.pickupCommissionPercent, rates.pickupCommissionPercent),
    agreed: store?.commissionPercent != null || store?.pickupCommissionPercent != null,
  };
}

/** Feasto's share of one store's part of a checkout. The rider's fee is never shared. */
export function feastoShare(
  order: { fulfillment: Fulfillment; subtotal: number; commissionFreeUntil: Date | null },
  rates: Rates,
  store?: StoreRates | null,
  at = new Date(),
) {
  const free = order.commissionFreeUntil !== null && order.commissionFreeUntil > at;
  const own = storeRates(store, rates);
  const commissionRate = free ? 0 : order.fulfillment === "DELIVERY" ? own.delivery : own.pickup;
  return {
    commissionRate,
    commission: centavos((order.subtotal * commissionRate) / 100),
    riderCutRate: 0,
    riderCut: 0,
  };
}

/** Feasto's share of a Pabili fee. The busy or rain add-on is all the rider's. */
export const pabiliCut = (fee: number, extraFee: number, rate: number) => centavos((Math.max(0, fee - extraFee) * rate) / 100);

/** When a newly approved store's free days end; null when there are none. */
export const freeUntil = (days: number, from = new Date()) => (days > 0 ? new Date(from.getTime() + days * 86400_000) : null);

// ---------- Who gets the money ----------

/**
 * Where an order's money goes, in the order of events:
 * - Online (e-wallet or card): Feasto holds the payment until the order is delivered or collected,
 *   in case it has to be refunded. Then it's split right away: the store gets the food minus the
 *   commission, the rider the fee minus Feasto's share, and Feasto keeps the rest. Nothing to settle:
 *   the shares are sent to their e-wallet or bank through Xendit Payouts (lib/payouts.ts).
 * - Cash: the resident pays the rider or the store directly, so Feasto never holds it. The store
 *   and the rider then owe Feasto its share, which the admin collects every week.
 */
export function payoutOf(order: { paymentMethod: "COD" | "ONLINE"; subtotal: number; commission: number; deliveryFee: number; riderCut: number; storeDiscount?: number; feastoDiscount?: number }) {
  const online = order.paymentMethod === "ONLINE";
  const storeDiscount = order.storeDiscount ?? 0;
  const feastoDiscount = order.feastoDiscount ?? 0;
  return {
    online,
    /** Sent to the store when it's delivered (online), or what the store keeps: the food, minus its own discounts and the commission */
    store: centavos(order.subtotal - storeDiscount - order.commission),
    rider: centavos(order.deliveryFee - order.riderCut),
    /** For cash, what the store owes Feasto: the commission, less Feasto's discounts it collected less cash for (negative: Feasto owes the store) */
    storeOwes: online ? 0 : centavos(order.commission - feastoDiscount),
    riderOwes: online ? 0 : order.riderCut,
  };
}

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What happened to a finished order's money, in the store's and the rider's words: for online
 * payments, the part just sent to them; for cash, Feasto's share they now owe.
 */
export async function payoutWords(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotal: true,
      commission: true,
      deliveryFee: true,
      riderCut: true,
      storeDiscount: true,
      feastoDiscount: true,
      checkout: { select: { paymentMethod: true } },
      vendor: { select: { payoutChannel: true, payoutNumber: true } },
      rider: { select: { riderProfile: { select: { payoutChannel: true, payoutNumber: true } } } },
    },
  });
  const p = payoutOf({
    paymentMethod: o.checkout.paymentMethod,
    subtotal: Number(o.subtotal),
    commission: Number(o.commission),
    deliveryFee: Number(o.deliveryFee),
    riderCut: Number(o.riderCut),
    storeDiscount: Number(o.storeDiscount),
    feastoDiscount: Number(o.feastoDiscount),
  });
  const commission = Number(o.commission);
  const feastoDiscount = Number(o.feastoDiscount);
  const riderCut = Number(o.riderCut);
  // Where the online share goes: their e-wallet or bank, or held until they add one
  const sending = (account: { payoutChannel: PayoutChannel | null; payoutNumber: string | null } | null | undefined, settings: string) =>
    account?.payoutChannel && account.payoutNumber ? `is being sent to your ${accountWords(account.payoutChannel, account.payoutNumber)}` : `is waiting for you: add your GCash, Maya or bank in ${settings} to receive it`;
  return {
    store: p.online
      ? `${peso(p.store)} for the food ${sending(o.vendor, "Reports")}${commission ? `, after Feasto's ${peso(commission)} commission` : ""}.`
      : feastoDiscount > 0
        ? p.storeOwes >= 0
          ? `Paid in cash, ${peso(feastoDiscount)} less because of Feasto's voucher, which Feasto pays: you owe Feasto ${peso(p.storeOwes)} (the ${peso(commission)} commission less that).`
          : `Paid in cash, ${peso(feastoDiscount)} less because of Feasto's voucher: Feasto owes you ${peso(-p.storeOwes)}, taken off what you pay Feasto.`
        : commission
        ? `Paid in cash. Feasto's ${peso(commission)} commission is added to what you pay Feasto each week.`
        : "Paid in cash. No commission: it's your free month.",
    rider: p.online
      ? `${peso(p.rider)} ${sending(o.rider?.riderProfile, "History")}${riderCut ? `, after Feasto's ${peso(riderCut)}` : ""}.`
      : `You keep ${peso(p.rider)} of the cash fee${riderCut ? `. Feasto's ${peso(riderCut)} is added to what you pay Feasto each week` : ""}.`,
  };
}

// ---------- Cash balances ----------

/**
 * What a store or rider still owes Feasto from cash orders: Feasto's share of every finished cash
 * order, minus what the admin already collected. Online orders never appear here: they were split
 * the moment they were delivered.
 */
export type Balance = {
  id: string;
  owed: number;
  /** Finished cash orders not settled yet */
  orders: number;
  lastSettledAt: string | null;
};

type Row = { id: string; owed: string | null; orders: bigint };
type Settled = { id: string; paid: string | null; orders: bigint | null; last: Date | null };

function combine(earned: Row[], settled: Settled[]): Balance[] {
  const done = new Map(settled.map((s) => [s.id, s]));
  const byId = new Map(earned.map((e) => [e.id, e]));
  return [...new Set([...byId.keys(), ...done.keys()])].map((id) => {
    const e = byId.get(id);
    const s = done.get(id);
    return {
      id,
      owed: centavos(Number(e?.owed ?? 0) - Number(s?.paid ?? 0)),
      orders: Number(e?.orders ?? 0) - Number(s?.orders ?? 0),
      lastSettledAt: s?.last?.toISOString() ?? null,
    };
  });
}

const only = (column: Prisma.Sql, id?: string) => (id ? Prisma.sql`AND ${column} = ${id}` : Prisma.empty);
const settledBy = (column: Prisma.Sql, id?: string) => Prisma.sql`
  SELECT ${column} AS id, sum(amount)::text AS paid, sum(orders) AS orders, max("createdAt") AS last
  FROM "Settlement" WHERE ${column} IS NOT NULL ${only(column, id)}
  GROUP BY 1`;

/** Every store's cash balance, or one store's: its commission on cash orders. */
export async function storeBalances(db: Prisma.TransactionClient = prisma, vendorId?: string): Promise<Balance[]> {
  const [earned, settled] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT o."vendorId" AS id, sum(o.commission - o."feastoDiscount")::text AS owed, count(*) AS orders
      FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId"
      WHERE o.status IN ('DELIVERED', 'COMPLETED') AND c."paymentMethod" = 'COD' ${only(Prisma.sql`o."vendorId"`, vendorId)}
      GROUP BY 1`,
    db.$queryRaw<Settled[]>(settledBy(Prisma.sql`"vendorId"`, vendorId)),
  ]);
  return combine(earned, settled);
}

/**
 * Every rider's cash balance, or one rider's: Feasto's share of the Pabili fees they collected in
 * cash (and of food delivery fees, from before riders kept all of them).
 */
export async function riderBalances(db: Prisma.TransactionClient = prisma, riderId?: string): Promise<Balance[]> {
  const [earned, settled] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT id, sum(owed)::text AS owed, sum(n)::bigint AS orders FROM (
        SELECT o."riderId" AS id, o."riderCut" AS owed, 1 AS n
        FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId"
        WHERE o.status = 'DELIVERED' AND o."riderId" IS NOT NULL AND c."paymentMethod" = 'COD' AND o."riderCut" > 0 ${only(Prisma.sql`o."riderId"`, riderId)}
        UNION ALL
        SELECT e."riderId", e."feastoCut", 1
        FROM "Errand" e
        WHERE e.status = 'DELIVERED' AND e."riderId" IS NOT NULL AND e."feastoCut" > 0 AND NOT e.prepaid ${only(Prisma.sql`e."riderId"`, riderId)}
      ) owed
      GROUP BY 1`,
    db.$queryRaw<Settled[]>(settledBy(Prisma.sql`"riderId"`, riderId)),
  ]);
  return combine(earned, settled);
}

const EMPTY = (id: string): Balance => ({ id, owed: 0, orders: 0, lastSettledAt: null });

export const storeBalance = async (vendorId: string, db: Prisma.TransactionClient = prisma) => (await storeBalances(db, vendorId))[0] ?? EMPTY(vendorId);
export const riderBalance = async (riderId: string, db: Prisma.TransactionClient = prisma) => (await riderBalances(db, riderId))[0] ?? EMPTY(riderId);
