import { prisma } from "./db.js";
import { manilaStartOfDay } from "./storeHours.js";

export type SalesDay = { date: string; orders: number; sales: number };

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
