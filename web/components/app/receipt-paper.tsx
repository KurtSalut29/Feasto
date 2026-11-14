import { Courier_Prime } from "next/font/google";
import type { ReactNode } from "react";

// The typewriter look of a thermal receipt printer
const receiptFont = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-receipt" });

/**
 * A printed slip: white thermal paper with torn zigzag edges and a soft shadow that follows them.
 * Printing the page prints only this (see the print rules in globals.css).
 */
export function ReceiptPaper({ label, children }: { label: string; children: ReactNode }) {
  return (
    <article
      data-receipt
      aria-label={label}
      className={`${receiptFont.className} mx-auto max-w-[340px] text-[0.8125rem] leading-snug text-[#222] [filter:drop-shadow(0_6px_14px_rgba(31,45,61,0.14))] print:[filter:none]`}
    >
      <div aria-hidden className="h-2 bg-[url('/receipt-edge-top.svg')] bg-[length:12px_8px] bg-repeat-x" />
      <div className="bg-white px-5 pt-4 pb-5">{children}</div>
      <div aria-hidden className="h-2 bg-[url('/receipt-edge-bottom.svg')] bg-[length:12px_8px] bg-repeat-x" />
    </article>
  );
}

/** A dashed rule across the slip; double for the total */
export function Rule({ double, light }: { double?: boolean; light?: boolean }) {
  return (
    <div
      aria-hidden
      className={`my-2.5 ${double ? "h-[5px] border-y border-dashed border-[#333]" : `border-t border-dashed ${light ? "border-[#bbb]" : "border-[#333]"}`}`}
    />
  );
}

/** A label on the left, its value on the right */
export function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

const manila = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", ...options });
/** "11/08/2026" in Manila */
export const slipDate = (iso: string) => manila(iso, { month: "2-digit", day: "2-digit", year: "numeric" });
/** "07:40 PM" in Manila */
export const slipTime = (iso: string) => manila(iso, { hour: "2-digit", minute: "2-digit", hour12: true });
/** "2026" in Manila */
export const slipYear = (iso: string) => manila(iso, { year: "numeric" });
