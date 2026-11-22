"use client";

import { Clock, Copy, Store, Truck } from "lucide-react";
import Image from "next/image";
import type { CSSProperties } from "react";
import { toast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { type VoucherCard } from "@/lib/promos";

/**
 * A Feasto voucher, shaped like a torn-off ticket: a stub with Chef Feasto (or the store's name, for a
 * store's own voucher), a perforated tear line with two notches, and the deal in big type with its
 * code to copy. `compact` is the size for the sale strip on Home; the full one is for My vouchers.
 */

const STUB = 76;
const STUB_COMPACT = 64;

/** The two half-circle bites out of the tear line, cut with a mask so whatever is behind shows through */
function notches(x: number, r = 8): CSSProperties {
  const top = `radial-gradient(circle ${r}px at ${x}px 0, #0000 97%, #000) top / 100% 51% no-repeat`;
  const bottom = `radial-gradient(circle ${r}px at ${x}px 100%, #0000 97%, #000) bottom / 100% 51% no-repeat`;
  return { mask: `${top}, ${bottom}`, WebkitMask: `${top}, ${bottom}` };
}

/** "₱50" + "OFF", "12%" + "OFF", "FREE" + "DELIVERY" */
function bigWords(v: Pick<VoucherCard, "benefit" | "value">) {
  const peso = `₱${v.value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
  if (v.benefit === "PERCENT_OFF") return { big: `${v.value}%`, small: "OFF" };
  if (v.benefit === "FREE_DELIVERY") return { big: "FREE", small: "DELIVERY" };
  if (v.benefit === "DELIVERY_OFF") return { big: peso, small: "OFF DELIVERY" };
  return { big: peso, small: "OFF" };
}

function copy(code: string) {
  void navigator.clipboard?.writeText(code).then(() => toast.success("Code copied", `${code}: paste it at checkout.`));
}

export function VoucherTicket({ voucher: v, compact = false, muted = false, fill = false }: { voucher: VoucherCard; compact?: boolean; muted?: boolean; fill?: boolean }) {
  const stub = compact ? STUB_COMPACT : STUB;
  const { big, small } = bigWords(v);
  const delivery = v.benefit === "FREE_DELIVERY" || v.benefit === "DELIVERY_OFF";
  const cap = v.maxDiscount && v.benefit !== "AMOUNT_OFF" ? `up to ₱${v.maxDiscount.toLocaleString("en-PH")}` : null;

  return (
    // The drop shadow sits on a wrapper: the mask would cut a box-shadow off
    <div className={`drop-shadow-[0_6px_14px_rgba(143,47,0,0.18)] ${compact && !fill ? "w-[17rem] shrink-0" : ""} ${muted ? "opacity-60 grayscale-[0.6]" : ""}`}>
      <div className="relative flex overflow-hidden rounded-2xl bg-white" style={notches(stub)}>
        {/* The stub: who gives it */}
        <div
          className="relative flex shrink-0 flex-col items-center justify-center gap-1 overflow-hidden bg-gradient-to-b from-brand-500 to-brand-700 px-1.5 py-2 text-center text-white"
          style={{ width: stub }}
        >
          {/* Faint rings behind the mascot, like a stamp */}
          <span aria-hidden className="absolute -top-6 -left-6 size-16 rounded-full border-[6px] border-white/10" />
          {v.store ? (
            <Store className={compact ? "size-6" : "size-7"} aria-hidden />
          ) : (
            <Image src="/Logo/feasto-mascot.png" alt="" width={44} height={44} className={`${compact ? "size-9" : "size-11"} object-contain drop-shadow`} />
          )}
          <span className="block w-full truncate text-[0.625rem] leading-none font-extrabold tracking-[0.16em] uppercase">{v.store ? "Store" : "Feasto"}</span>
          <span className="block text-[0.5625rem] leading-none font-semibold tracking-[0.18em] text-white/80 uppercase">Voucher</span>
        </div>

        {/* The tear line */}
        <span aria-hidden className="my-3 w-0 shrink-0 border-l-2 border-dashed border-brand-200" />

        {/* The deal */}
        <div className={`min-w-0 flex-1 ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
          <p className="flex items-baseline gap-1.5 text-brand-700">
            {delivery && <Truck className="size-4 shrink-0 self-center" aria-hidden />}
            <span className={`leading-none font-extrabold tracking-tight ${compact ? "text-2xl" : "text-[1.75rem]"}`}>{big}</span>
            <span className="text-xs leading-none font-bold tracking-wide">{small}</span>
          </p>
          <p className="mt-1 truncate text-[0.8125rem] font-medium text-ink">{v.store ? `${v.store.name} only` : v.title}</p>
          <p className="truncate text-xs text-muted">
            {[v.minSpend > 0 ? `Min. ₱${v.minSpend.toLocaleString("en-PH")}` : "No minimum", cap, v.firstOrder ? "First order" : null].filter(Boolean).join(" · ")}
          </p>
          {!compact && (
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
              {v.upcoming ? (
                <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                  <Clock className="size-3" aria-hidden />
                  Starts {formatDateTime(v.startsAt)}
                </span>
              ) : (
                v.endsAt && <span>Until {formatDateTime(v.endsAt)}</span>
              )}
              {v.problem && <span className="font-semibold text-gray-700">{v.problem}</span>}
            </p>
          )}
          {v.code && (
            <button
              type="button"
              onClick={() => copy(v.code!)}
              aria-label={`Copy the code ${v.code}`}
              className="tap mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-2 py-0.5 font-mono text-[0.8125rem] font-bold tracking-wider text-brand-800 transition-colors hover:bg-brand-100"
            >
              {v.code}
              <Copy className="size-3.5 text-brand-600" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
