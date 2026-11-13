import { Prisma, type Fulfillment } from "../generated/prisma/client.js";
import type { Settings } from "./settings.js";
import { prisma } from "./db.js";

/**
 * How Feasto earns: a commission on each order's food (paid by the store), and a share of the
 * delivery fee (paid by the rider). Residents pay nothing extra, and tips all go to the rider.
 *
 * Both are worked out at checkout and copied onto the order, like the delivery fee, so changing
 * the rates never changes an order already placed. Feasto only earns them once the order is
 * delivered or collected: cancelled, declined and refunded orders pay nothing.
 */

/** Orders Feasto earns from */
export const EARNED = ["DELIVERED", "COMPLETED"] as const;

const centavos = (value: number) => Math.round(value * 100) / 100;

type Rates = Pick<Settings, "commissionPercent" | "pickupCommissionPercent" | "riderFeePercent">;

/** Feasto's share of one store's part of a checkout. */
export function feastoShare(
  order: { fulfillment: Fulfillment; subtotal: number; deliveryFee: number; commissionFreeUntil: Date | null },
  rates: Rates,
  at = new Date(),
) {
  const free = order.commissionFreeUntil !== null && order.commissionFreeUntil > at;
  const commissionRate = free ? 0 : order.fulfillment === "DELIVERY" ? rates.commissionPercent : rates.pickupCommissionPercent;
  const riderCutRate = order.fulfillment === "DELIVERY" ? rates.riderFeePercent : 0;
  return {
    commissionRate,
    commission: centavos((order.subtotal * commissionRate) / 100),
    riderCutRate,
    riderCut: centavos((order.deliveryFee * riderCutRate) / 100),
  };
}

/** When a newly approved store's free days end; null when there are none. */
export const freeUntil = (days: number, from = new Date()) => (days > 0 ? new Date(from.getTime() + days * 86400_000) : null);

// ---------- Who gets the money ----------

/**
 * Where an order's money goes, in the order of events:
 * - Online (e-wallet or card): Feasto holds the payment until the order is delivered or collected,
 *   in case it has to be refunded. Then it's split right away: the store gets the food minus the
 *   commission, the rider the fee minus Feasto's share, and Feasto keeps the rest. Nothing to settle.
 * - Cash: the resident pays the rider or the store directly, so Feasto never holds it. The store
 *   and the rider then owe Feasto its share, which the admin collects every week.
 */
export function payoutOf(order: { paymentMethod: "COD" | "ONLINE"; subtotal: number; commission: number; deliveryFee: number; riderCut: number }) {
  const online = order.paymentMethod === "ONLINE";
  return {
    online,
    /** Sent to the store when it's delivered (online), or what the store keeps from the cash */
    store: centavos(order.subtotal - order.commission),
    rider: centavos(order.deliveryFee - order.riderCut),
    /** For cash, what the store and the rider owe Feasto */
    storeOwes: online ? 0 : order.commission,
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
    select: { subtotal: true, commission: true, deliveryFee: true, riderCut: true, checkout: { select: { paymentMethod: true } } },
  });
  const p = payoutOf({
    paymentMethod: o.checkout.paymentMethod,
    subtotal: Number(o.subtotal),
    commission: Number(o.commission),
    deliveryFee: Number(o.deliveryFee),
    riderCut: Number(o.riderCut),
  });
  const commission = Number(o.commission);
  const riderCut = Number(o.riderCut);
  return {
    store: p.online
      ? `${peso(p.store)} for the food was sent to you${commission ? `, after Feasto's ${peso(commission)} commission` : ""}.`
      : commission
        ? `Paid in cash. Feasto's ${peso(commission)} commission is added to what you pay Feasto each week.`
        : "Paid in cash. No commission: it's your free month.",
    rider: p.online
      ? `${peso(p.rider)} was sent to you${riderCut ? `, after Feasto's ${peso(riderCut)}` : ""}.`
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
      SELECT o."vendorId" AS id, sum(o.commission)::text AS owed, count(*) AS orders
      FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId"
      WHERE o.status IN ('DELIVERED', 'COMPLETED') AND c."paymentMethod" = 'COD' ${only(Prisma.sql`o."vendorId"`, vendorId)}
      GROUP BY 1`,
    db.$queryRaw<Settled[]>(settledBy(Prisma.sql`"vendorId"`, vendorId)),
  ]);
  return combine(earned, settled);
}

/** Every rider's cash balance, or one rider's: Feasto's share of the fees they collected in cash. */
export async function riderBalances(db: Prisma.TransactionClient = prisma, riderId?: string): Promise<Balance[]> {
  const [earned, settled] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT o."riderId" AS id, sum(o."riderCut")::text AS owed, count(*) AS orders
      FROM "Order" o JOIN "Checkout" c ON c.id = o."checkoutId"
      WHERE o.status = 'DELIVERED' AND o."riderId" IS NOT NULL AND c."paymentMethod" = 'COD' ${only(Prisma.sql`o."riderId"`, riderId)}
      GROUP BY 1`,
    db.$queryRaw<Settled[]>(settledBy(Prisma.sql`"riderId"`, riderId)),
  ]);
  return combine(earned, settled);
}

const EMPTY = (id: string): Balance => ({ id, owed: 0, orders: 0, lastSettledAt: null });

export const storeBalance = async (vendorId: string, db: Prisma.TransactionClient = prisma) => (await storeBalances(db, vendorId))[0] ?? EMPTY(vendorId);
export const riderBalance = async (riderId: string, db: Prisma.TransactionClient = prisma) => (await riderBalances(db, riderId))[0] ?? EMPTY(riderId);
