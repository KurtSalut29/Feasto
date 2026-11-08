"use client";

import { Banknote, Check, ChevronDown, Nfc } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { formatPeso } from "@/lib/format";
import type { OnlinePayment } from "@/lib/types";

export type PayChoice = "COD" | OnlinePayment;

/** What one store's order costs: its food plus its own delivery fee */
export type PayPart = { store: string; amount: number };

/** A logo file in /public/payments. `color` keeps the brand's own colors; otherwise it's drawn in one color. */
type LogoFile = { src: string; color?: boolean };

type Option = {
  value: PayChoice;
  name: string;
  group: "Cash" | "E-wallets" | "Cards";
  /** On the white tile */
  tile?: LogoFile;
  /** On the card's face; `named` when the logo already spells the name */
  card?: LogoFile & { named?: boolean };
  /** Brand color, for one-color logos on the white tile */
  brand: string;
  /** The card's face */
  face: string;
  /** Cards: the demo card's number, masked */
  number?: string;
};

// Every way to pay, with its brand's real logo and colors. GCash, Maya and Coins.ph logos are from
// their own websites; the card networks, Grab and Shopee from Simple Icons. The marks belong to their
// owners and are shown as accepted payment methods in a simulated checkout.
const OPTIONS: Option[] = [
  { value: "COD", name: "Cash", group: "Cash", brand: "#059669", face: "from-emerald-700 via-emerald-600 to-teal-500" },
  {
    value: "GCASH",
    name: "GCash",
    group: "E-wallets",
    tile: { src: "/payments/gcash.svg", color: true },
    card: { src: "/payments/gcash.svg" },
    brand: "#0a5cff",
    face: "from-[#0038b8] via-[#0a5cff] to-[#4d8dff]",
  },
  {
    value: "MAYA",
    name: "Maya",
    group: "E-wallets",
    tile: { src: "/payments/maya.svg", color: true },
    card: { src: "/payments/maya.svg", color: true, named: true },
    brand: "#00b464",
    face: "from-[#050505] via-[#151a17] to-[#0c3b25]",
  },
  {
    value: "GRABPAY",
    name: "GrabPay",
    group: "E-wallets",
    tile: { src: "/payments/grab.svg" },
    card: { src: "/payments/grab.svg" },
    brand: "#00B14F",
    face: "from-[#00813f] via-[#00a651] to-[#3cc77f]",
  },
  {
    value: "SHOPEEPAY",
    name: "ShopeePay",
    group: "E-wallets",
    tile: { src: "/payments/shopee.svg" },
    card: { src: "/payments/shopee.svg" },
    brand: "#EE4D2D",
    face: "from-[#c4300f] via-[#ee4d2d] to-[#ff7a59]",
  },
  {
    value: "COINS",
    name: "Coins.ph",
    group: "E-wallets",
    tile: { src: "/payments/coins.png", color: true },
    card: { src: "/payments/coins-icon.png", color: true },
    brand: "#1652f0",
    face: "from-[#0b2a6f] via-[#1652f0] to-[#4f8cff]",
  },
  {
    value: "VISA",
    name: "Visa",
    group: "Cards",
    tile: { src: "/payments/visa.svg" },
    card: { src: "/payments/visa.svg", named: true },
    brand: "#1A1F71",
    face: "from-[#141a5e] via-[#1a1f71] to-[#3b4cc0]",
    number: "•••• •••• •••• 4242",
  },
  {
    value: "MASTERCARD",
    name: "Mastercard",
    group: "Cards",
    tile: { src: "/payments/mastercard-color.svg", color: true },
    card: { src: "/payments/mastercard-color.svg", color: true, named: true },
    brand: "#EB001B",
    face: "from-[#111111] via-[#2a2a2a] to-[#4a4a4a]",
    number: "•••• •••• •••• 4444",
  },
  {
    value: "JCB",
    name: "JCB",
    group: "Cards",
    tile: { src: "/payments/jcb.svg" },
    card: { src: "/payments/jcb.svg", named: true },
    brand: "#0B4EA2",
    face: "from-[#0a3f86] via-[#0b4ea2] to-[#0a7f5a]",
    number: "•••• •••• •••• 0505",
  },
  {
    value: "AMEX",
    name: "American Express",
    group: "Cards",
    tile: { src: "/payments/americanexpress.svg" },
    card: { src: "/payments/americanexpress.svg", named: true },
    brand: "#2E77BC",
    face: "from-[#1f5f99] via-[#2e77bc] to-[#6aa8e0]",
    number: "•••• •••••• •0005",
  },
];

/** Shown before "More"; the rest wait one tap away */
const FIRST = new Set<PayChoice>(["COD", "GCASH", "MAYA", "VISA", "MASTERCARD"]);

/** "09171234567" → "0917 ••• 4567" */
function maskPhone(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 ? `${digits.slice(0, 4)} ••• ${digits.slice(-4)}` : "Linked to your account";
}

/** A brand logo: in its own colors, or drawn in one color as brands allow on colored backgrounds. */
function Logo({ file, tint, className }: { file: LogoFile; tint: string; className: string }) {
  if (file.color) {
    // eslint-disable-next-line @next/next/no-img-element -- a small local logo, shown as is
    return <img src={file.src} alt="" className={`object-contain ${className}`} aria-hidden />;
  }
  const mask: CSSProperties = {
    backgroundColor: tint,
    maskImage: `url(${file.src})`,
    WebkitMaskImage: `url(${file.src})`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "contain",
    WebkitMaskSize: "contain",
  };
  return <span className={`block ${className}`} style={mask} aria-hidden />;
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
}: {
  value: PayChoice;
  onChange: (value: PayChoice) => void;
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
                  <Tile key={option.value} option={option} on={option.value === value} onChange={onChange} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {OPTIONS.filter((o) => FIRST.has(o.value)).map((option) => (
              <Tile key={option.value} option={option} on={option.value === value} onChange={onChange} />
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

      <PayCard key={chosen.value} option={chosen} total={total} holder={holder} phone={phone} delivery={delivery} parts={parts} />
    </div>
  );
}

function Tile({ option, on, onChange }: { option: Option; on: boolean; onChange: (value: PayChoice) => void }) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-1.5 py-3 text-center transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
        on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line hover:border-gray-300"
      }`}
    >
      <input type="radio" name="payment" value={option.value} checked={on} onChange={() => onChange(option.value)} className="sr-only" />
      <span className="flex h-9 w-16 items-center justify-center rounded-lg bg-white ring-1 ring-line" aria-hidden>
        {option.tile ? <Logo file={option.tile} tint={option.brand} className="h-6 w-12" /> : <Banknote className="size-6" style={{ color: option.brand }} />}
      </span>
      <span className="text-sm leading-tight font-semibold text-ink">{option.name}</span>
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
}: {
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
        aria-label={isCash ? `Cash, ${formatPeso(total)}` : `${option.name} ${isCard ? `card ending ${option.number?.slice(-4)}` : maskPhone(phone)}, ${holder}`}
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
              {isCash ? formatPeso(total) : isCard ? option.number : maskPhone(phone)}
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
