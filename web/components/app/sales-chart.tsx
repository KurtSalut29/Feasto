"use client";

import { useState } from "react";
import { formatPeso } from "@/lib/format";
import type { SalesDay } from "@/lib/types";

/** 1,250 -> "1.3K" for the axis. */
function compact(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(value));
}

/** A rounded axis maximum and its 4 equal steps (e.g. 0, 2K, 4K, 6K, 8K). */
function niceScale(max: number) {
  if (max <= 0) return { top: 100, ticks: [0, 25, 50, 75, 100] };
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

const dayLabel = (date: string, style: "short" | "long") =>
  new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    ...(style === "short" ? { month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" }),
  });

/**
 * Column chart of money per day (sales, or a rider's earnings), one bar per day.
 * Hover or focus a bar for its numbers; a hidden table gives the same data to screen readers.
 */
export function SalesChart({
  days,
  valueLabel = "Sales",
  countLabel = ["order", "orders"],
  height = 220,
}: {
  days: SalesDay[];
  valueLabel?: string;
  countLabel?: [string, string];
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { top, ticks } = niceScale(Math.max(...days.map((d) => d.sales)));
  const labelEvery = days.length > 10 ? Math.ceil(days.length / 7) : 1;
  const count = (n: number) => `${n} ${n === 1 ? countLabel[0] : countLabel[1]}`;
  const hovered = active === null ? null : days[active];

  return (
    <figure className="m-0 pt-2">
      <div className="relative flex gap-3" style={{ height }}>
        {/* Y axis */}
        <div aria-hidden className="relative w-9 shrink-0 text-right text-[11px] text-gray-500 tabular-nums">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(tick / top) * 100}%` }}>
              {compact(tick)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" onMouseLeave={() => setActive(null)}>
          {/* Hairline gridlines */}
          {ticks.map((tick) => (
            <div key={tick} aria-hidden className="absolute inset-x-0 h-px bg-line/80" style={{ bottom: `${(tick / top) * 100}%` }} />
          ))}

          {/* Columns: each day is a full-height hit area with a thin bar inside */}
          <div className="absolute inset-0 flex items-end" role="list" aria-label={`${valueLabel} per day`}>
            {days.map((day, i) => (
              <div
                key={day.date}
                role="listitem"
                tabIndex={0}
                aria-label={`${dayLabel(day.date, "long")}: ${formatPeso(day.sales)}, ${count(day.orders)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group flex h-full flex-1 cursor-default items-end justify-center rounded-md outline-none focus-visible:bg-brand-50/60"
              >
                <div
                  className={`w-full max-w-6 rounded-t-[4px] transition-colors ${
                    active === i ? "bg-brand-700" : i === days.length - 1 ? "bg-brand-600" : "bg-brand-500/80"
                  }`}
                  style={{ height: `${(day.sales / top) * 100}%`, minHeight: day.sales > 0 ? 3 : 0, marginInline: 1 }}
                />
              </div>
            ))}
          </div>

          {/* Tooltip: at the top of the plot, beside the bar (left of it on the right half) so it never covers it */}
          {hovered && active !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 z-10 rounded-xl bg-ink px-3 py-2 text-xs whitespace-nowrap text-white shadow-lg"
              style={
                active >= days.length / 2
                  ? { right: `calc(${((days.length - active) / days.length) * 100}% + 6px)` }
                  : { left: `calc(${((active + 1) / days.length) * 100}% + 6px)` }
              }
            >
              <p className="font-semibold">{dayLabel(hovered.date, "long")}</p>
              <p className="mt-0.5 text-white/85">
                {valueLabel}: <span className="font-semibold text-white">{formatPeso(hovered.sales)}</span>
              </p>
              <p className="text-white/85">{count(hovered.orders)}</p>
            </div>
          )}
        </div>
      </div>

      {/* X axis */}
      <div aria-hidden className="mt-2 flex gap-3 text-[11px] text-gray-500">
        <div className="w-9 shrink-0" />
        <div className="flex flex-1">
          {days.map((day, i) => (
            <span key={day.date} className="flex-1 text-center whitespace-nowrap">
              {i === days.length - 1 ? "Today" : (days.length - 1 - i) % labelEvery === 0 ? dayLabel(day.date, "short") : ""}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{valueLabel} per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>{valueLabel}</th>
            <th>{countLabel[1]}</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{dayLabel(day.date, "long")}</td>
              <td>{formatPeso(day.sales)}</td>
              <td>{day.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
