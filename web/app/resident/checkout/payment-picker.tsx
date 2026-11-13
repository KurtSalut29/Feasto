"use client";

import { Banknote, Check, ChevronDown, Nfc } from "lucide-react";
import { useState } from "react";
import { formatPeso } from "@/lib/format";
import { PAYMENT_OPTIONS as OPTIONS, PaymentLogo as Logo, type PaymentOption as Option, type PayChoice } from "@/components/app/payment-brands";

export type { PayChoice };

/** What one store's order costs: its food plus its own delivery fee */
export type PayPart = { store: string; amount: number };

/** Shown before "More"; the rest wait one tap away */
const FIRST = new Set<PayChoice>(["COD", "GCASH", "MAYA", "VISA", "MASTERCARD"]);

/** "09171234567" → "0917 ••• 4567" */
function maskPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? `${digits.slice(0, 4)} ••• ${digits.slice(-4)}` : "Linked to your account";
}

/**
 * How to pay: the usual ways first (cash, GCash, Maya, Visa, Mastercard) and the rest under
 * More. Below the tiles, the chosen way is drawn as a real card in its brand's colors.
 */
export function PaymentPicker({
  value,
  onChange,
  total,
  holder,
  phone,
  delivery,
  parts,
  refusedBy = () => null,
  realPayments = false,
}: {
  /** Paid on Xendit's page (test mode) instead of simulated */
  realPayments?: boolean;
  value: PayChoice;
  onChange: (value: PayChoice) => void;
  /** The store in the cart that doesn't take this way to pay, if any */
  refusedBy?: (choice: PayChoice) => string | null;
  total: number;
  holder: string;
  phone: string | null;
  delivery: boolean;
  /** One per store; each store's order is delivered (and paid in cash) on its own */
  parts: PayPart[];
}) {
  const [more, setMore] = useState(!FIRST.has(value));
  const chosen = OPTIONS.find((o) => o.value === value)!;

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Payment method</legend>
        {more ? (
          (["Cash", "E-wallets", "Cards"] as const).map((group) => (
            <div key={group} className="mb-3">
              <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{group}</p>
              <div className="grid grid-cols-3 gap-2">
                {OPTIONS.filter((o) => o.group === group).map((option) => (
                  <Tile key={option.value} option={option} on={option.value === value} onChange={onChange} refusedBy={refusedBy(option.value)} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {OPTIONS.filter((o) => FIRST.has(o.value)).map((option) => (
              <Tile key={option.value} option={option} on={option.value === value} onChange={onChange} refusedBy={refusedBy(option.value)} />
            ))}
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-expanded={false}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-1.5 py-3 text-center text-ink transition hover:border-gray-400 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-canvas" aria-hidden>
                <ChevronDown className="size-5" />
              </span>
              <span className="text-sm leading-tight font-semibold">More</span>
              <span className="text-[11px] leading-tight text-muted">{OPTIONS.length - FIRST.size} other ways</span>
            </button>
          </div>
        )}
        {more && (
          <button
            type="button"
            onClick={() => setMore(false)}
            aria-expanded
            className="text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            Show fewer
          </button>
        )}
      </fieldset>

      <PayCard key={chosen.value} option={chosen} total={total} holder={holder} phone={phone} delivery={delivery} parts={parts} real={realPayments} />
    </div>
  );
}

function Tile({ option, on, onChange, refusedBy }: { option: Option; on: boolean; onChange: (value: PayChoice) => void; refusedBy: string | null }) {
  return (
    <label
      title={refusedBy ? `${refusedBy} doesn't take ${option.name}` : undefined}
      className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-3 text-center transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
        refusedBy
          ? "cursor-not-allowed border-dashed border-line bg-canvas/60 opacity-60 grayscale"
          : on
            ? "cursor-pointer border-brand-500 bg-brand-50 ring-1 ring-brand-500"
            : "cursor-pointer border-line hover:border-gray-300"
      }`}
    >
      <input
        type="radio"
        name="payment"
        value={option.value}
        checked={on}
        disabled={Boolean(refusedBy)}
        onChange={() => onChange(option.value)}
        className="sr-only"
      />
      <span className="flex h-9 w-16 items-center justify-center rounded-lg bg-white ring-1 ring-line" aria-hidden>
        {option.tile ? <Logo file={option.tile} tint={option.brand} className="h-6 w-12" /> : <Banknote className="size-6" style={{ color: option.brand }} />}
      </span>
      <span className="text-sm leading-tight font-semibold text-ink">{option.name}</span>
      {refusedBy && <span className="-mt-1 line-clamp-1 text-[11px] leading-tight text-muted">Not at {refusedBy}</span>}
      {on && (
        <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden>
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
    </label>
  );
}

/** The chosen way to pay, drawn at a real card's proportions. */
function PayCard({
  option,
  total,
  holder,
  phone,
  delivery,
  parts,
  real,
}: {
  real: boolean;
  option: Option;
  total: number;
  holder: string;
  phone: string | null;
  delivery: boolean;
  parts: PayPart[];
}) {
  const name = holder.toUpperCase();
  const split = parts.length > 1;
  const isCard = option.group === "Cards";
  const isCash = option.value === "COD";

  return (
    <figure className="mt-4">
      <div
        role="img"
        aria-label={isCash ? `Cash, ${formatPeso(total)}` : `${option.name} ${isCard ? (real ? "card" : `card ending ${option.number?.slice(-4)}`) : maskPhone(phone)}, ${holder}`}
        className={`relative mx-auto aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-[0_18px_40px_-18px_rgba(16,24,40,0.55)] transition duration-300 starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none ${option.face}`}
      >
        {/* Soft rings in the corner, like the print on a real card */}
        <span className="absolute -top-16 -right-16 size-48 rounded-full border-[28px] border-white/10" aria-hidden />
        <span className="absolute -bottom-20 -left-10 size-44 rounded-full bg-white/5" aria-hidden />

        {/* Three bands of fixed height (top, middle, bottom), so every card lines up the same way */}
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex h-8 items-center justify-between">
            {isCash ? (
              <p className="text-2xl font-bold tracking-tight">Cash</p>
            ) : isCard ? (
              <p className="text-sm font-semibold tracking-widest text-white/85 uppercase">Debit / Credit</p>
            ) : option.card?.named ? (
              <Logo file={option.card} tint="#ffffff" className="h-8 w-28" />
            ) : (
              <span className="flex items-center gap-2">
                {option.card && <Logo file={option.card} tint="#ffffff" className="size-8" />}
                <span className="text-xl font-bold tracking-tight">{option.name}</span>
              </span>
            )}
            {isCash ? <Banknote className="size-7 text-white/80" aria-hidden /> : <Nfc className="size-7 text-white/80" aria-hidden />}
          </div>

          <div className="flex h-[4.25rem] flex-col justify-end gap-2">
            {isCard ? (
              // The chip
              <span className="block h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 shadow-inner" aria-hidden />
            ) : (
              <p className="flex h-7 items-end text-[10px] tracking-widest text-white/70 uppercase">
                {isCash
                  ? split
                    ? delivery
                      ? `Pay ${parts.length} riders in all`
                      : `Pay ${parts.length} stores in all`
                    : delivery
                      ? "Pay the rider"
                      : "Pay at the store"
                  : "Mobile number"}
              </p>
            )}
            <p className={`h-8 leading-8 tabular-nums ${isCash ? "text-2xl font-bold" : "font-mono text-lg tracking-[0.16em]"}`}>
              {isCash ? formatPeso(total) : isCard ? (real ? "•••• •••• •••• ••••" : option.number) : maskPhone(phone)}
            </p>
          </div>

          <div className="flex h-10 items-end justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="text-[10px] tracking-widest text-white/60 uppercase">{isCash ? "Paid by" : isCard ? "Card holder" : "Account name"}</p>
              <p className="truncate font-semibold tracking-wide">{name}</p>
            </div>
            {isCard && option.card ? (
              <Logo file={option.card} tint="#ffffff" className="h-8 w-14 shrink-0" />
            ) : (
              <div className="shrink-0 text-right">
                <p className="text-[10px] tracking-widest text-white/60 uppercase">Amount</p>
                <p className="font-semibold tabular-nums">{formatPeso(total)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <figcaption className="mt-2.5 text-center text-xs text-muted">
        {isCash
          ? split
            ? delivery
              ? "Each store's order comes with its own rider. Pay each rider only their part:"
              : "Pay each store its part when you collect it:"
            : delivery
              ? "Have the exact amount ready if you can."
              : "Pay when you collect your order."
          : real
            ? `${split ? `One ${option.name} payment covers all ${parts.length} stores: ${formatPeso(total)}.` : `You'll pay ${formatPeso(total)} with ${option.name}.`} Next you'll ${isCard ? "enter your card" : `log in to ${option.name}`} on Xendit's secure payment page; Feasto never sees ${isCard ? "your card number" : "your account"}. Test mode: ${isCard ? "use a test card" : "a test page"}, no real money moves.`
            : `${split ? `One ${option.name} payment covers all ${parts.length} stores: ${formatPeso(total)}.` : `You'll pay ${formatPeso(total)} with ${option.name} when you place the order.`} Simulated for this project: no real money moves${isCard ? " and no real card is needed" : ""}.`}
      </figcaption>
      {isCash && split && (
        <ul className="mx-auto mt-2 max-w-sm divide-y divide-line rounded-xl border border-line text-sm" aria-label="What to pay each">
          {parts.map((part, i) => (
            <li key={part.store} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="min-w-0 truncate text-ink">
                <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{i + 1}</span>
                {delivery ? `Rider from ${part.store}` : part.store}
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">{formatPeso(part.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
