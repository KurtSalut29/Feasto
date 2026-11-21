import { CircleSlash, Pill } from "lucide-react";
import type { ReactNode } from "react";
import { formatPeso } from "@/lib/format";
import { amountOf, ifMissingLabel, notBoughtLabel, RULE_TEXT, type PabiliItem } from "@/lib/pabili";

/**
 * A Pabili's list, the same for the resident and the rider: how much of each and in what unit,
 * the details, the price guessed, what to do if it's not there, the items' care badges, and
 * the ones the rider couldn't buy (struck through, with why). `action` adds the rider's buttons.
 */
export function PabiliList({ items, action }: { items: PabiliItem[]; action?: (item: PabiliItem, index: number) => ReactNode }) {
  return (
    <ul className="divide-y divide-line text-[0.9375rem] text-ink">
      {items.map((item, i) => {
        const missing = Boolean(item.notBought);
        const badges = [...new Set((item.flags ?? []).filter((f) => f !== "BANNED").map((f) => (f === "TOBACCO" ? "ALCOHOL" : f)))] as (keyof typeof RULE_TEXT)[];
        return (
          <li key={i} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={`w-20 shrink-0 font-semibold tabular-nums ${missing ? "text-gray-400 line-through" : "text-brand-700"}`}>{amountOf(item.quantity, item.unit)}</span>
            <span className="min-w-0 flex-1">
              <span className={missing ? "text-gray-500 line-through" : "font-medium"}>{item.name}</span>
              {item.estimate ? <span className="ml-1.5 text-sm text-muted tabular-nums">~{formatPeso(item.estimate)}</span> : null}
              {item.note && <span className="block text-[0.8125rem] text-amber-800">“{item.note}”</span>}
              {!missing && item.ifMissing && (
                <span className="block text-[0.8125rem] text-muted">
                  If it&apos;s not there: {item.ifMissing === "REPLACE" && item.replacement ? `get ${item.replacement}` : ifMissingLabel(item.ifMissing).toLowerCase()}
                </span>
              )}
              {badges.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {badges.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                      {b === "PRESCRIPTION" && <Pill className="size-3" aria-hidden />}
                      {RULE_TEXT[b].label}
                    </span>
                  ))}
                </span>
              )}
              {item.notBought && (
                <span className="mt-1 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-red-700">
                  <CircleSlash className="size-3.5" aria-hidden />
                  Not bought: {notBoughtLabel(item.notBought.reason).toLowerCase()}
                </span>
              )}
              {action?.(item, i)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
