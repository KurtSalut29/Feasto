import { BadgePercent } from "lucide-react";
import { formatPeso } from "@/lib/format";
import type { DiscountLine } from "@/lib/promos";

/**
 * An order's discounts on its receipt, each with what it took off. For the store, who pays for
 * each one (the store, Feasto, or both); the rider's fee is never touched.
 */
export function DiscountRows({ lines, forStore = false, className = "" }: { lines: DiscountLine[] | undefined; forStore?: boolean; className?: string }) {
  if (!lines?.length) return null;
  return (
    <>
      {lines.map((l, i) => (
        <div key={`${l.label}-${i}`} className={`flex justify-between gap-3 ${className}`}>
          <dt className="flex min-w-0 items-start gap-1.5 text-emerald-800">
            <BadgePercent className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              {l.label}
              {forStore && (
                <span className="block text-xs text-muted">
                  {l.store > 0 && l.feasto > 0 ? `You pay ${formatPeso(l.store)}, Feasto pays ${formatPeso(l.feasto)}` : l.store > 0 ? "You pay for it" : "Feasto pays for it: you still get the full price"}
                </span>
              )}
            </span>
          </dt>
          <dd className="shrink-0 font-semibold text-emerald-800 tabular-nums">−{formatPeso(l.amount)}</dd>
        </div>
      ))}
    </>
  );
}
