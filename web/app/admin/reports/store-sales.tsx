"use client";

import { ChevronDown, Cpu, Search } from "lucide-react";
import { useState } from "react";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { formatPeso } from "@/lib/format";

export type StoreSalesRow = { vendorId: string; name: string; orders: number; sales: number; topDish: string | null; computedBy: string };

/** The top stores show first; the rest are one tap away, so a report of a hundred stores stays short */
const FIRST = 10;

// Each worker gets its own chip color, so you can see the jobs were split between them
const WORKER_COLORS = ["bg-sky-50 text-sky-700 ring-sky-100", "bg-violet-50 text-violet-700 ring-violet-100", "bg-teal-50 text-teal-700 ring-teal-100"];

/** Which worker computed a store's share of the report */
export function WorkerChip({ name, workers }: { name: string; workers: string[] }) {
  const color = WORKER_COLORS[Math.max(0, workers.indexOf(name)) % WORKER_COLORS.length];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${color}`}>
      <Cpu className="size-3" aria-hidden />
      {name}
    </span>
  );
}

/** Sales per store, highest first, with a search and the stores without sales tucked away. */
export function StoreSales({ rows, totalSales, workers }: { rows: StoreSalesRow[]; totalSales: number; workers: string[] }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [withSales, setWithSales] = useState(true);

  const sorted = [...rows].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  const rank = new Map(sorted.map((r, i) => [r.vendorId, i + 1]));
  const top = sorted[0]?.sales ?? 0;
  const q = query.trim().toLowerCase();
  const matching = sorted.filter((r) => (!withSales || r.orders > 0) && (!q || r.name.toLowerCase().includes(q) || r.topDish?.toLowerCase().includes(q)));
  const shown = all || q ? matching : matching.slice(0, FIRST);
  const noSales = rows.filter((r) => r.orders === 0).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Store or dish"
            aria-label="Search stores"
            className="h-9 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </div>
        {noSales > 0 && (
          <button
            type="button"
            aria-pressed={!withSales}
            onClick={() => setWithSales(!withSales)}
            className={`h-9 rounded-xl px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500 ${!withSales ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink"}`}
          >
            Include {noSales} {noSales === 1 ? "store" : "stores"} without sales
          </button>
        )}
      </div>
      {/* Phones: one card per store */}
      <ul className="divide-y divide-line md:hidden">
        {shown.map((row) => {
          const n = rank.get(row.vendorId)!;
          const share = totalSales ? (row.sales / totalSales) * 100 : 0;
          return (
            <li key={row.vendorId} className="flex gap-3 px-4 py-3.5">
              <span className={`w-6 shrink-0 pt-0.5 text-sm font-bold tabular-nums ${n <= 3 ? "text-brand-600" : "text-gray-400"}`}>{n}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-medium text-ink">{row.name}</p>
                  <p className="shrink-0 font-semibold text-ink tabular-nums">{formatPeso(row.sales)}</p>
                </div>
                <p className="text-xs text-muted">
                  {row.orders} {row.orders === 1 ? "order" : "orders"} · {row.topDish ? `Best seller: ${row.topDish}` : "No orders in this period"}
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${top ? (row.sales / top) * 100 : 0}%` }} />
                  </div>
                  <span className="w-10 text-right text-xs text-muted tabular-nums">{share.toFixed(0)}%</span>
                  <WorkerChip name={row.computedBy} workers={workers} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className={`${TABLE} min-w-[680px]`}>
          <thead className={THEAD}>
            <tr>
              <th className={`${TH} w-12`}>#</th>
              <th className={TH}>Store</th>
              <th className={`${TH} text-right`}>Orders</th>
              <th className={`${TH} text-right`}>Sales</th>
              <th className={TH}>Share of sales</th>
              <th className={TH}>Computed by</th>
            </tr>
          </thead>
          <tbody className={TBODY}>
            {shown.map((row) => {
              const share = totalSales ? (row.sales / totalSales) * 100 : 0;
              const n = rank.get(row.vendorId)!;
              return (
                <tr key={row.vendorId} className={TR}>
                  <td className={`${TD} font-bold tabular-nums ${n <= 3 ? "text-brand-600" : "text-gray-400"}`}>{n}</td>
                  <td className={TD}>
                    <p className="font-medium text-ink">{row.name}</p>
                    <p className="text-xs text-muted">{row.topDish ? `Best seller: ${row.topDish}` : "No orders in this period"}</p>
                  </td>
                  <td className={`${TD} text-right text-ink tabular-nums`}>{row.orders}</td>
                  <td className={`${TD} text-right font-semibold text-ink tabular-nums`}>{formatPeso(row.sales)}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${top ? (row.sales / top) * 100 : 0}%` }} />
                      </div>
                      <span className="w-10 text-xs text-muted tabular-nums">{share.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className={TD}>
                    <WorkerChip name={row.computedBy} workers={workers} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">No stores match.</p>}
      {!q && matching.length > FIRST && (
        <div className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => setAll(!all)}
            aria-expanded={all}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {all ? `Show the top ${FIRST} only` : `Show all ${matching.length} stores`}
            <ChevronDown className={`size-4 transition ${all ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
