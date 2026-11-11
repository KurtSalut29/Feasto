import Image from "next/image";
import { formatPeso, formatRange } from "@/lib/format";

const compact = (d: string) => d.slice(2).replaceAll("-", "");
/** Same number the downloaded file carries (server/src/lib/reportExport/document.ts reportNumber) */
export const reportNumber = (scope: "S" | "P", from: string, to: string, key: string) =>
  `FR-${scope}-${compact(from)}-${compact(to)}-${key.slice(-4).toUpperCase()}`;

/**
 * A small picture of the downloaded report's first page, in the Feasto report format:
 * the orange band, the logo, "SALES REPORT" with its number, the title and period, and the dashed end mark.
 */
export function ReportPaper({
  number,
  title,
  from,
  to,
  days,
  sales,
  orders,
}: {
  number: string;
  title: string;
  from: string;
  to: string;
  days: number;
  sales: number;
  orders: number;
}) {
  return (
    <figure aria-label={`Preview of report ${number}`} className="m-0 mx-auto max-w-[290px] rotate-[-1.2deg] transition-transform duration-300 hover:rotate-0 motion-reduce:rotate-0">
      <div className="overflow-hidden rounded-md bg-white shadow-[0_1px_0_rgba(31,45,61,0.04),0_14px_30px_-14px_rgba(31,45,61,0.45)] ring-1 ring-line">
        <div aria-hidden className="h-1.5 bg-brand-500 shadow-[inset_0_-1px_0_#b23a00]" />
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Image src="/Logo/feasto-logo.png" alt="Feasto" width={76} height={22} className="h-[22px] w-[76px] object-contain" />
              <p className="mt-0.5 text-[6.5px] font-bold tracking-[0.22em] text-muted uppercase">Order · Book · Enjoy</p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-semibold tracking-[0.22em] text-brand-600 uppercase">Sales report</p>
              <p className="mt-0.5 text-[9px] font-bold text-ink">{number}</p>
            </div>
          </div>
          <div aria-hidden className="my-2.5 border-t border-dashed border-gray-300" />
          <p className="truncate text-[15px] leading-tight font-bold text-ink">{title}</p>
          <p className="text-[10px] text-muted">
            Sales report · {formatRange(from, to)} · {days} {days === 1 ? "day" : "days"}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {[
              ["Sales", formatPeso(sales)],
              ["Orders", orders.toLocaleString("en-PH")],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-brand-50 px-2 py-1.5 ring-1 ring-brand-200/70">
                <p className="text-[6.5px] font-bold tracking-wider text-brand-700 uppercase">{label}</p>
                <p className="truncate text-[11px] font-bold text-ink tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {/* Table rows, sketched */}
          <div aria-hidden className="mt-2.5 space-y-1">
            <div className="h-2.5 rounded-sm bg-ink" />
            {[92, 70, 84, 58].map((w) => (
              <div key={w} className="flex items-center justify-between gap-2">
                <span className="h-1 rounded-full bg-gray-200" style={{ width: `${w / 2}%` }} />
                <span className="h-1 w-8 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-3 border-y border-dashed border-gray-300 py-0.5 text-center text-[6px] font-bold tracking-[0.3em] text-muted">
            END OF REPORT
          </div>
        </div>
      </div>
    </figure>
  );
}
