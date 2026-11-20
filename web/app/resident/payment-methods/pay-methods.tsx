"use client";

import { CreditCard, Lock, Plus, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AccountCard, BankCard, cardNumberOnCard } from "@/components/app/pay-card-face";
import { PAYMENT_OPTIONS } from "@/components/app/payment-brands";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import type { SavedPayMethod } from "@/lib/types";

type Kind = SavedPayMethod["kind"];
type Brand = "VISA" | "MASTERCARD" | "JCB" | "AMEX";

const BRAND_NAME: Record<Brand, string> = { VISA: "Visa", MASTERCARD: "Mastercard", JCB: "JCB", AMEX: "American Express" };

/** Which network a card number belongs to, from its first digits */
export function brandOf(digits: string): Brand | null {
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  if (digits.startsWith("4")) return "VISA";
  if ((two >= 51 && two <= 55) || (digits.length >= 4 && four >= 2221 && four <= 2720)) return "MASTERCARD";
  if (digits.length >= 4 && four >= 3528 && four <= 3589) return "JCB";
  if (two === 34 || two === 37) return "AMEX";
  return null;
}

/** The check digit every real card number passes (Luhn); catches a mistyped digit */
export function luhnOk(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** Spaced the way it's printed: 4-4-4-4, or 4-6-5 for American Express */
function spacedCard(digits: string, brand: Brand | null) {
  if (brand === "AMEX") return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(" ");
  return digits.slice(0, 19).replace(/(.{4})(?=.)/g, "$1 ");
}

const maskPhone = (n: string) => `${n.slice(0, 4)} ••• ${n.slice(-4)}`;

/**
 * The resident's own e-wallets and cards, each drawn as the card it is. A card is checked in the
 * browser (network and check digit) and only its network, last 4 digits, expiry and name are saved:
 * the full number and the CVV never leave this page, and paying with it still happens on Xendit's
 * secure page.
 */
export function PayMethods({ methods, me }: { methods: SavedPayMethod[]; me: { name: string; phone: string | null } }) {
  const router = useRouter();
  const [adding, setAdding] = useState(methods.length === 0);
  const [kind, setKind] = useState<Kind>("GCASH");
  const [holderName, setHolderName] = useState(me.name);
  const [number, setNumber] = useState(me.phone ?? "");
  const [card, setCard] = useState("");
  const [expiry, setExpiry] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const digits = card.replace(/\D/g, "");
  const brand = brandOf(digits);
  const cardLength = brand === "AMEX" ? 15 : 16;

  async function save() {
    const problems: Record<string, string> = {};
    let body: Record<string, unknown>;
    if (kind === "CARD") {
      const [mm, yy] = expiry.split("/").map((v) => Number(v));
      if (!brand) problems.card = "We take Visa, Mastercard, JCB and American Express. Check the first digits.";
      else if (digits.length !== cardLength || !luhnOk(digits)) problems.card = "That card number isn't right. Check each digit.";
      if (!(mm >= 1 && mm <= 12) || !(yy >= 0 && yy <= 99)) problems.expiry = "Enter it as MM/YY, like 08/28.";
      else if (new Date(2000 + yy, mm, 1) <= new Date()) problems.expiry = "This card has expired.";
      setErrors(problems);
      if (Object.keys(problems).length) return;
      // Only what's safe to keep goes to Feasto
      body = { kind, holderName, brand, last4: digits.slice(-4), expMonth: mm, expYear: 2000 + yy };
    } else {
      body = { kind, holderName, number };
    }
    setBusy(true);
    const result = await apiRequest("/me/pay-methods", { method: "POST", body });
    setBusy(false);
    if (!result.ok) {
      const fe = result.fieldErrors ?? {};
      setErrors({ number: fe.number?.[0], holderName: fe.holderName?.[0], expiry: fe.expiry?.[0] ?? fe.expMonth?.[0], card: fe.last4?.[0] ?? fe.brand?.[0] });
      if (!result.fieldErrors) toast.error("Couldn't save it", result.error);
      return;
    }
    toast.success(kind === "CARD" ? `${BRAND_NAME[brand!]} ending ${digits.slice(-4)} saved` : `${kind === "GCASH" ? "GCash" : "Maya"} saved`);
    setCard("");
    setExpiry("");
    setErrors({});
    setAdding(false);
    router.refresh();
  }

  async function remove(m: SavedPayMethod) {
    const result = await apiRequest(`/me/pay-methods/${m.id}`, { method: "DELETE" });
    if (!result.ok) return toast.error("Couldn't remove it", result.error);
    toast.success("Removed");
    router.refresh();
  }

  // The preview card, filled in as it's typed: dots for the digits still to come
  const typedCard = digits ? spacedCard((digits + "•".repeat(Math.max(0, cardLength - digits.length))).slice(0, cardLength), brand) : cardNumberOnCard(brand, null);
  const typedExpiry = expiry ? (expiry.length >= 5 ? expiry : `${expiry}${"MM/YY".slice(expiry.length)}`) : null;

  return (
    <div className="space-y-6">
      {methods.length > 0 && (
        <ul className="grid gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3" aria-label="Saved ways to pay">
          {methods.map((m) => {
            const option = PAYMENT_OPTIONS.find((o) => o.value === (m.kind === "CARD" ? m.brand : m.kind));
            const title = m.kind === "CARD" ? `${BRAND_NAME[m.brand as Brand]} •••• ${m.last4}` : `${option?.name} ${maskPhone(m.number ?? "")}`;
            return (
              <li key={m.id} className="min-w-0">
                {m.kind === "CARD" ? (
                  <BankCard brand={m.brand} number={cardNumberOnCard(m.brand, m.last4)} holder={m.holderName} expiry={`${String(m.expMonth).padStart(2, "0")}/${String(m.expYear).slice(-2)}`} />
                ) : (
                  <AccountCard kind={m.kind} number={m.number ?? ""} name={m.holderName} hide />
                )}
                <div className="mt-2.5 flex items-center justify-between gap-3 px-1">
                  <p className="min-w-0 text-sm text-muted">
                    <span className="block truncate font-semibold text-ink">{title}</span>
                    Shown when you pay with {option?.name ?? "it"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void remove(m)}
                    aria-label={`Remove ${m.kind === "CARD" ? `card ending ${m.last4}` : option?.name}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <Trash2 className="size-[18px]" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
          {!adding && methods.length < 6 && (
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-line bg-white/60 text-muted transition hover:border-brand-200 hover:bg-brand-50/40 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-white ring-1 ring-line">
                  <Plus className="size-5" aria-hidden />
                </span>
                <span className="font-semibold">Add GCash, Maya or a card</span>
              </button>
            </li>
          )}
        </ul>
      )}

      {adding && (
        <section aria-labelledby="add-method" className="rounded-3xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:p-6">
          <h2 id="add-method" className="font-semibold text-ink">
            Add a way to pay
          </h2>
          <div className="mt-4 grid items-start gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
            {/* What it will look like when paying, filled in as it's typed */}
            <div className="md:sticky md:top-24">
              {kind === "CARD" ? (
                <BankCard brand={brand} number={typedCard} holder={holderName} expiry={typedExpiry} />
              ) : (
                <AccountCard kind={kind} number={number} name={holderName} />
              )}
              <p className="mt-2.5 text-center text-xs text-muted">This is how it shows when you pay.</p>
            </div>

            <div className="min-w-0 space-y-4">
              <SegmentedControl
                name="kind"
                legend="Kind"
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setErrors({});
                }}
                options={[
                  { value: "GCASH", label: "GCash", Icon: Wallet },
                  { value: "MAYA", label: "Maya", Icon: Wallet },
                  { value: "CARD", label: "Card", Icon: CreditCard },
                ]}
              />
              {kind === "CARD" ? (
                <>
                  <TextField
                    label="Card number"
                    value={spacedCard(digits, brand)}
                    onChange={(e) => setCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 5678 9012 3456"
                    hint={brand ? `${BRAND_NAME[brand]} card` : "Visa, Mastercard, JCB or American Express"}
                    error={errors.card}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Expiry (MM/YY)"
                      value={expiry}
                      onChange={(e) => {
                        const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                        setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                      }}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="08/28"
                      error={errors.expiry}
                    />
                    <TextField label="Name on the card" value={holderName} onChange={(e) => setHolderName(e.target.value)} autoComplete="cc-name" error={errors.holderName} />
                  </div>
                  <p className="flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-xs text-muted">
                    <Lock className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                    <span>
                      Feasto keeps only the last 4 digits, the expiry and the name, to show which card you&apos;re using. The full number and the CVV stay with you: you type them on
                      Xendit&apos;s secure page when you pay.
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <TextField label={`${kind === "GCASH" ? "GCash" : "Maya"} number`} type="tel" value={number} onChange={(e) => setNumber(e.target.value)} error={errors.number} />
                  <TextField label="Name on the account" value={holderName} onChange={(e) => setHolderName(e.target.value)} autoComplete="name" error={errors.holderName} />
                </>
              )}
              <div className="flex gap-3 pt-1 md:justify-end">
                {methods.length > 0 && (
                  <Button variant="secondary" className="flex-1 md:flex-none" onClick={() => setAdding(false)}>
                    Cancel
                  </Button>
                )}
                <Button className="flex-1 md:flex-none md:px-8" loading={busy} onClick={save}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
