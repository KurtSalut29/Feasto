import { Landmark, Nfc } from "lucide-react";
import type { ReactNode } from "react";
import { PAYMENT_OPTIONS, PaymentLogo } from "@/components/app/payment-brands";

/**
 * A card drawn at a real bank card's proportions (85.6 × 54 mm): the brand on top, the number in
 * the middle, the name along the bottom. Used for every saved way to pay or be paid, so a resident's
 * GCash, the admin's bank account and a rider's payout account all read the same way.
 */
export function CardFace({
  face,
  label,
  top,
  corner = <Nfc className="size-6 text-white/80" aria-hidden />,
  chip = false,
  caption,
  number,
  holderLabel,
  holder,
  end,
  size = "md",
  dimmed = false,
  className = "",
}: {
  /** The gradient, as Tailwind classes */
  face: string;
  /** What a screen reader says for the whole card */
  label: string;
  top: ReactNode;
  corner?: ReactNode;
  chip?: boolean;
  /** The small label above the number, when there's no chip */
  caption?: string;
  number: string;
  holderLabel: string;
  holder: string;
  /** Bottom right: the expiry and network logo on a card */
  end?: ReactNode;
  size?: "md" | "sm";
  /** Turned off: shown faded */
  dimmed?: boolean;
  className?: string;
}) {
  const small = size === "sm";
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative aspect-[1.586] w-full overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-[0_18px_40px_-18px_rgba(16,24,40,0.55)] ring-1 ring-black/5 ${
        small ? "p-4" : "p-5"
      } ${face} ${dimmed ? "opacity-55 grayscale-[35%]" : ""} ${className}`}
    >
      {/* The print on a real card: soft rings, and a sheen across the top */}
      <span className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full border-[28px] border-white/10" aria-hidden />
      <span className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-white/5" aria-hidden />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/12 via-transparent to-black/10" aria-hidden />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex h-8 items-center justify-between gap-3">
          <div className="min-w-0">{top}</div>
          <div className="shrink-0">{corner}</div>
        </div>

        <div className={`flex flex-col justify-end ${small ? "gap-1.5" : "gap-2"}`}>
          {chip ? (
            <span className={`relative block rounded-md bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner ${small ? "h-6 w-9" : "h-7 w-10"}`} aria-hidden>
              {/* The chip's contacts */}
              <span className="absolute inset-x-1.5 top-1/2 h-px bg-amber-700/30" />
              <span className="absolute inset-y-1 left-1/2 w-px bg-amber-700/30" />
            </span>
          ) : (
            caption && <p className="text-[0.625rem] tracking-widest text-white/85 uppercase">{caption}</p>
          )}
          <p className={`font-mono tracking-[0.14em] whitespace-nowrap tabular-nums [text-shadow:0_1px_1px_rgba(0,0,0,0.25)] ${small ? "text-[0.9375rem]" : "text-lg"}`}>{number}</p>
        </div>

        <div className="flex items-end justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="text-[0.625rem] tracking-widest text-white/85 uppercase">{holderLabel}</p>
            <p className="truncate font-semibold tracking-wide">{holder.toUpperCase() || "—"}</p>
          </div>
          {end && <div className="flex shrink-0 items-end gap-3">{end}</div>}
        </div>
      </div>
    </div>
  );
}

/** Each bank in its own colors; any other bank gets a plain dark card */
const BANK_FACES: { match: RegExp; face: string }[] = [
  { match: /\bbdo\b/i, face: "from-[#00205b] via-[#003a8c] to-[#1d5fc4]" },
  { match: /\bbpi\b/i, face: "from-[#7a0b11] via-[#a8141b] to-[#d33a2c]" },
  { match: /metro/i, face: "from-[#00245c] via-[#0a3f94] to-[#3b74d1]" },
  { match: /land\s*bank/i, face: "from-[#0a4f1c] via-[#13803a] to-[#46a95e]" },
  { match: /union\s*bank/i, face: "from-[#b23a0a] via-[#e8650f] to-[#f99847]" },
  { match: /security/i, face: "from-[#003d36] via-[#006c5f] to-[#2aa595]" },
  { match: /pnb|philippine national/i, face: "from-[#0b2a5b] via-[#1b3f86] to-[#b0122b]" },
  { match: /rcbc/i, face: "from-[#00305f] via-[#00508f] to-[#2a86c9]" },
  { match: /china\s*bank/i, face: "from-[#7a0c12] via-[#9d1b22] to-[#c9a227]" },
];
export const bankFace = (bank: string) => BANK_FACES.find((b) => b.match.test(bank))?.face ?? "from-slate-900 via-slate-700 to-indigo-700";

/** "09171234567" → "0917 123 4567", or with the middle hidden */
export function phoneOnCard(number: string, hide = false) {
  const d = number.replace(/\D/g, "");
  if (d.length < 8) return d || "09•• ••• ••••";
  return hide ? `${d.slice(0, 4)} ••• ${d.slice(-4)}` : `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

/** A bank account number in groups of 4, optionally with only the last 4 showing */
export function accountOnCard(number: string, hide = false) {
  const d = number.replace(/\s/g, "");
  if (!d) return "•••• •••• ••••";
  if (hide && d.length > 4) return `${"•".repeat(Math.min(8, d.length - 4)).replace(/(.{4})(?=.)/g, "$1 ")} ${d.slice(-4)}`;
  return d.replace(/(.{4})(?=.)/g, "$1 ");
}

/** The brand across the top of an e-wallet card: its logo, or the logo and its name */
export function WalletMark({ wallet, small = false }: { wallet: "GCASH" | "MAYA"; small?: boolean }) {
  const option = PAYMENT_OPTIONS.find((o) => o.value === wallet)!;
  if (option.card?.named) return <PaymentLogo file={option.card} tint="#ffffff" className={small ? "h-7 w-24" : "h-8 w-28"} />;
  return (
    <span className="flex items-center gap-2">
      {option.card && <PaymentLogo file={option.card} tint="#ffffff" className={small ? "size-7" : "size-8"} />}
      <span className={`font-bold tracking-tight ${small ? "text-lg" : "text-xl"}`}>{option.name}</span>
    </span>
  );
}

/** How a card's number is printed, with only its last 4 showing (American Express groups it 4-6-5) */
export const cardNumberOnCard = (brand: string | null, last4: string | null) =>
  brand === "AMEX" ? `•••• •••••• •${last4 ?? "••••"}` : `•••• •••• •••• ${last4 ?? "••••"}`;

/** A Visa, Mastercard, JCB or American Express card: chip, number, holder, expiry and network logo */
export function BankCard({
  brand,
  number,
  holder,
  expiry,
  size,
  className,
}: {
  brand: string | null;
  /** Already masked or spaced */
  number: string;
  holder: string;
  /** "08/29" */
  expiry: string | null;
  size?: "md" | "sm";
  className?: string;
}) {
  const option = PAYMENT_OPTIONS.find((o) => o.value === brand && o.group === "Cards");
  const small = size === "sm";
  return (
    <CardFace
      face={option?.face ?? "from-slate-800 via-slate-700 to-slate-500"}
      label={`${option?.name ?? "Card"} ${number}, ${holder}${expiry ? `, valid thru ${expiry}` : ""}`}
      top={<p className={`font-semibold tracking-widest uppercase ${small ? "text-xs" : "text-sm"}`}>Debit / Credit</p>}
      chip
      number={number}
      holderLabel="Card holder"
      holder={holder}
      size={size}
      className={className}
      end={
        <>
          <span className="text-right">
            <span className="block text-[0.625rem] tracking-widest text-white/85 uppercase">Valid thru</span>
            <span className="block font-semibold tabular-nums">{expiry ?? "MM/YY"}</span>
          </span>
          {option?.card ? <PaymentLogo file={option.card} tint="#ffffff" className={small ? "h-7 w-12" : "h-8 w-14"} /> : <span className={small ? "h-7 w-12" : "h-8 w-14"} />}
        </>
      }
    />
  );
}

export const walletFace = (wallet: "GCASH" | "MAYA") => PAYMENT_OPTIONS.find((o) => o.value === wallet)!.face;

/**
 * An e-wallet or bank account as a card: where a store or rider is paid, or where residents send
 * money to Feasto. `hide` keeps only the ends of the number showing.
 */
export function AccountCard({
  kind,
  bank,
  number,
  name,
  caption,
  hide = false,
  size,
  dimmed,
  corner,
  className,
}: {
  kind: "GCASH" | "MAYA" | "BANK";
  /** The bank's name, for a bank account */
  bank?: string;
  number: string;
  name: string;
  caption?: string;
  hide?: boolean;
  size?: "md" | "sm";
  dimmed?: boolean;
  corner?: ReactNode;
  className?: string;
}) {
  const isBank = kind === "BANK";
  const small = size === "sm";
  const shown = isBank ? accountOnCard(number, hide) : phoneOnCard(number, hide);
  const title = isBank ? bank || "Bank" : kind === "GCASH" ? "GCash" : "Maya";
  return (
    <CardFace
      face={isBank ? bankFace(bank ?? "") : walletFace(kind)}
      label={`${title} ${shown}, ${name}`}
      top={
        isBank ? (
          <span className="flex min-w-0 items-center gap-2">
            <Landmark className={small ? "size-5" : "size-6"} aria-hidden />
            <span className={`truncate font-bold tracking-tight ${small ? "text-lg" : "text-xl"}`}>{title}</span>
          </span>
        ) : (
          <WalletMark wallet={kind} small={small} />
        )
      }
      corner={corner}
      caption={caption ?? (isBank ? "Account number" : "Mobile number")}
      number={shown}
      holderLabel="Account name"
      holder={name}
      size={size}
      dimmed={dimmed}
      className={className}
    />
  );
}
