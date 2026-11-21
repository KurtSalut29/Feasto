"use client";

import { BadgePercent, Check, HeartHandshake, TicketPercent, Truck } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { SwitchField } from "@/components/ui/switch-field";
import { formatPeso } from "@/lib/format";
import { benefitWords, isDeliveryVoucher, type DiscountLine, type VoucherCard } from "@/lib/promos";

/** The server's answer for the checkout (POST /checkout/quote) */
export type PromoQuote = {
  groups: { storeId: string; lines: DiscountLine[]; discount: number; senior: boolean }[];
  discount: number;
  voucher: { code: string; title: string; applied: boolean; message: string | null; amount: number } | null;
  deliveryVoucher: { code: string; title: string; applied: boolean; message: string | null; amount: number } | null;
  senior: { eligible: boolean; kind: "SENIOR" | "PWD" | null; requested: boolean; applied: boolean; message: string | null };
  stores: { id: string; name: string }[];
};

/**
 * Choosing what comes off: one voucher for the food and one for the delivery (from "My vouchers"
 * or typed), and the Senior Citizen or PWD discount for someone with that verified ID. The
 * server works out every peso; this shows its answers.
 */
export function VoucherPicker({
  quote,
  voucherCode,
  deliveryCode,
  senior,
  delivery,
  onVoucher,
  onDelivery,
  onSenior,
}: {
  quote: PromoQuote | null;
  voucherCode: string | null;
  deliveryCode: string | null;
  senior: boolean;
  delivery: boolean;
  onVoucher: (code: string | null) => void;
  onDelivery: (code: string | null) => void;
  onSenior: (on: boolean) => void;
}) {
  const { data } = useApiData<{ vouchers: VoucherCard[] }>("/promos/vouchers");
  const [typed, setTyped] = useState("");
  const usable = (data?.vouchers ?? []).filter((v) => !v.problem && !v.upcoming && v.code);
  const food = usable.filter((v) => !isDeliveryVoucher(v));
  const ship = usable.filter((v) => isDeliveryVoucher(v));

  function apply() {
    const code = typed.trim().toUpperCase();
    if (!code) return;
    const known = data?.vouchers.find((v) => v.code === code);
    if (known && isDeliveryVoucher(known)) onDelivery(code);
    else onVoucher(code);
    setTyped("");
  }

  const state = (code: string | null, answer: PromoQuote["voucher"]) => (code && answer?.code === code ? answer : null);
  const foodAnswer = state(voucherCode, quote?.voucher ?? null);
  const shipAnswer = state(deliveryCode, quote?.deliveryVoucher ?? null);

  const chip = (v: VoucherCard, on: boolean, pick: () => void) => (
    <button
      key={v.id}
      type="button"
      role="radio"
      aria-checked={on}
      onClick={pick}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
        on ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"
      }`}
    >
      {isDeliveryVoucher(v) ? <Truck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden /> : <TicketPercent className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">{benefitWords(v)}</span>
        <span className="block text-sm text-muted">
          {v.title}
          {v.minSpend > 0 ? ` · min. ${formatPeso(v.minSpend)}` : ""}
          {v.store ? ` · ${v.store.name} only` : ""}
        </span>
        <span className="mt-0.5 block text-xs font-semibold tracking-wide text-gray-500">{v.code}</span>
      </span>
      {on && <Check className="size-5 shrink-0 text-brand-600" aria-hidden />}
    </button>
  );

  return (
    <div className="space-y-4">
      {(food.length > 0 || voucherCode) && (
        <div>
          <p id="voucher-food" className="mb-2 text-sm font-medium text-ink">
            Voucher
          </p>
          <div role="radiogroup" aria-labelledby="voucher-food" className="space-y-2">
            {food.map((v) => chip(v, voucherCode === v.code, () => onVoucher(voucherCode === v.code ? null : v.code)))}
            {voucherCode && !food.some((v) => v.code === voucherCode) && (
              <p className="flex items-center justify-between gap-3 rounded-xl border border-brand-500 bg-brand-50/60 px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{voucherCode}</span>
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => onVoucher(null)}>
                  Remove
                </button>
              </p>
            )}
          </div>
          {foodAnswer && <Answer answer={foodAnswer} />}
        </div>
      )}
      {delivery && (ship.length > 0 || deliveryCode) && (
        <div>
          <p id="voucher-ship" className="mb-2 text-sm font-medium text-ink">
            Delivery voucher
          </p>
          <div role="radiogroup" aria-labelledby="voucher-ship" className="space-y-2">
            {ship.map((v) => chip(v, deliveryCode === v.code, () => onDelivery(deliveryCode === v.code ? null : v.code)))}
            {deliveryCode && !ship.some((v) => v.code === deliveryCode) && (
              <p className="flex items-center justify-between gap-3 rounded-xl border border-brand-500 bg-brand-50/60 px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{deliveryCode}</span>
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => onDelivery(null)}>
                  Remove
                </button>
              </p>
            )}
          </div>
          {shipAnswer && <Answer answer={shipAnswer} />}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label className="sr-only" htmlFor="voucher-code">
          Voucher code
        </label>
        <input
          id="voucher-code"
          value={typed}
          onChange={(e) => setTyped(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
          placeholder="Voucher code"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-4 text-[0.9375rem] tracking-wide text-ink uppercase outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-gray-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
        />
        <button type="submit" disabled={!typed.trim()} className="h-11 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40">
          Apply
        </button>
      </form>

      {quote?.senior.eligible && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-1">
          <SwitchField
            label={quote.senior.kind === "PWD" ? "Use my PWD discount" : "Use my Senior Citizen discount"}
            description="20% off one serving from each store, for your own meal (RA 9994 and RA 10754). It can't be added to vouchers: you get whichever takes off more."
            checked={senior}
            onChange={onSenior}
          />
          {senior && quote.senior.message && (
            <p className="flex gap-2 px-3 pb-2 text-sm text-sky-900">
              <HeartHandshake className="mt-0.5 size-4 shrink-0" aria-hidden />
              {quote.senior.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Answer({ answer }: { answer: NonNullable<PromoQuote["voucher"]> }) {
  return answer.applied ? (
    <p role="status" className="mt-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
      <BadgePercent className="size-4" aria-hidden />
      {answer.code}: {formatPeso(answer.amount)} off
    </p>
  ) : (
    <p role="alert" className="mt-2 text-sm text-red-700">
      {answer.code}: {answer.message}
    </p>
  );
}
