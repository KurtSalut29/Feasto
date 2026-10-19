import { redis } from "./redis.js";

/**
 * A sales report is computed map-reduce style:
 *  1. "report.requested": a worker lists the stores and sends one "report.part" job per store.
 *  2. "report.part": any worker (several can run) computes one store's numbers in parallel.
 *  3. The worker that finishes the last part combines them and marks the report done.
 * Progress and results live in Redis so every API copy can show them.
 */
export const reportKey = (id: string) => `report:${id}`;
export const reportPartsKey = (id: string) => `report:${id}:parts`;
export const REPORT_LIST = "reports";

export type ReportPart = {
  vendorId: string;
  name: string;
  orders: number;
  sales: number;
  deliveryFees: number;
  cancelled: number;
  topDish: string | null;
  computedBy: string;
};

export async function readReport(id: string) {
  const [meta, parts] = await Promise.all([redis.hgetall(reportKey(id)), redis.hgetall(reportPartsKey(id))]);
  if (!meta.status) return null;
  const rows = Object.values(parts)
    .map((p) => JSON.parse(p) as ReportPart)
    .sort((a, b) => b.sales - a.sales);
  return {
    id,
    status: meta.status as "running" | "done",
    from: meta.from,
    to: meta.to,
    requestedAt: meta.requestedAt,
    finishedAt: meta.finishedAt ?? null,
    durationMs: meta.durationMs ? Number(meta.durationMs) : null,
    total: Number(meta.total ?? 0),
    done: Number(meta.done ?? 0),
    workers: [...new Set(rows.map((r) => r.computedBy))].sort(),
    rows,
    totals: {
      orders: rows.reduce((n, r) => n + r.orders, 0),
      sales: rows.reduce((n, r) => n + r.sales, 0),
      deliveryFees: rows.reduce((n, r) => n + r.deliveryFees, 0),
      cancelled: rows.reduce((n, r) => n + r.cancelled, 0),
    },
  };
}
