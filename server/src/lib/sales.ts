import { prisma } from "./db.js";
import { manilaStartOfDay } from "./storeHours.js";

export type SalesDay = { date: string; orders: number; sales: number };

/** The last 7 × 24 hours, and the same hours one week earlier */
export type WeekTrend = { orders: number; sales: number; previousOrders: number; previousSales: number };

/**
 * This week against last week, fairly: the last 7 × 24 hours up to now, against the 7 × 24
 * hours before that. Counting by calendar days would set today's few morning orders against a
 * whole day from last week, so every morning would look like a drop.
 */
export async function weekTrend(vendorId?: string): Promise<WeekTrend> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 86400_000);
  const twoWeeksAgo = new Date(now - 14 * 86400_000);
  const [row] = await prisma.$queryRaw<{ orders: bigint; sales: string | null; previousOrders: bigint; previousSales: string | null }[]>`
    SELECT count(*) FILTER (WHERE "createdAt" >= ${weekAgo}) AS orders,
           (sum(subtotal) FILTER (WHERE "createdAt" >= ${weekAgo}))::text AS sales,
           count(*) FILTER (WHERE "createdAt" < ${weekAgo}) AS "previousOrders",
           (sum(subtotal) FILTER (WHERE "createdAt" < ${weekAgo}))::text AS "previousSales"
    FROM "Order"
    WHERE status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      AND "createdAt" >= ${twoWeeksAgo} AND "createdAt" <= ${new Date(now)}
      AND (${vendorId ?? null}::text IS NULL OR "vendorId" = ${vendorId ?? null})`;
  return {
    orders: Number(row?.orders ?? 0),
    sales: Number(row?.sales ?? 0),
    previousOrders: Number(row?.previousOrders ?? 0),
    previousSales: Number(row?.previousSales ?? 0),
  };
}

/**
 * Orders and sales per day for the last `days` days (Philippine dates), oldest first.
 * Days without orders are included as zeros so a chart has no gaps.
 * Pass a vendorId for one store, or leave it out for all of Feasto.
 */
export async function dailySales(days: number, vendorId?: string): Promise<SalesDay[]> {
  const since = new Date(manilaStartOfDay().getTime() - (days - 1) * 86400_000);
  const rows = await prisma.$queryRaw<{ day: string; orders: bigint; sales: string | null }[]>`
    SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS day,
           count(*) AS orders,
           sum(subtotal)::text AS sales
    FROM "Order"
    WHERE status NOT IN ('AWAITING_PAYMENT', 'REJECTED', 'CANCELLED')
      AND "createdAt" >= ${since}
      AND (${vendorId ?? null}::text IS NULL OR "vendorId" = ${vendorId ?? null})
    GROUP BY day`;
  const byDay = new Map(rows.map((r) => [r.day, r]));

  const result: SalesDay[] = [];
  const todayManila = new Date(Date.now() + 8 * 3600_000);
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(todayManila.getTime() - i * 86400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    result.push({ date, orders: Number(row?.orders ?? 0), sales: Number(row?.sales ?? 0) });
  }
  return result;
}
