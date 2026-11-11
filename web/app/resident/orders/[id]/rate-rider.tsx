"use client";

import { Banknote, Bike, Check, HandCoins, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { celebrate } from "@/components/app/celebrate";
import { PAYMENT_OPTIONS, PaymentLogo } from "@/components/app/payment-brands";
import { Stars } from "@/components/app/rating";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import { ONLINE_LABEL } from "@/lib/order-status";
import { MAX_TIP, RIDER_ISSUES, RIDER_PRAISE, TIP_AMOUNTS } from "@/lib/rider-ratings";
import type { OnlinePayment, RiderRatingGiven } from "@/lib/types";

const LABELS = ["", "Bad", "Not great", "Okay", "Good", "Excellent!"];
/** E-wallets first, then cards: the ways to pay a tip on a cash order */
const TIP_WAYS = PAYMENT_OPTIONS.filter((o) => o.value !== "COD");

const firstName = (name: string) => name.trim().split(/\s+/)[0];

/**
 * Rate the rider and, if the resident wants, tip them. Separate from the store's rating: a late
 * rider shouldn't cost the kitchen its stars. The tip is paid online: with the order's own wallet
 * or card, or (for a cash order, the rider having left) one picked here.
 */
export function RateRider({
  orderId,
  rider,
  given,
  tip,
  tipMethod,
  paidWith,
  open,
}: {
  orderId: string;
  rider: { name: string; vehicle: string | null };
  given: RiderRatingGiven | null;
  /** The tip already given, in pesos */
  tip: number;
  tipMethod: OnlinePayment | null;
  /** The wallet or card the order was paid with; null for cash */
  paidWith: OnlinePayment | null;
  /** False once the days for rating have passed */
  open: boolean;
}) {
  const router = useRouter();
  const name = firstName(rider.name);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [tipChoice, setTipChoice] = useState<number | "other">(0);
  const [otherTip, setOtherTip] = useState("");
  const [way, setWay] = useState<OnlinePayment>(paidWith ?? "GCASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (given) {
    return (
      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">You rated {name}</h2>
        <div className="mt-2 flex items-center gap-2">
          <Stars value={given.rating} size="size-5" />
          <span className="text-sm font-medium text-muted">{LABELS[given.rating]}</span>
        </div>
        {given.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What you picked">
            {given.tags.map((t) => (
              <li key={t} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink">
                {t}
              </li>
            ))}
          </ul>
        )}
        {given.comment && <p className="mt-2 text-sm text-ink">“{given.comment}”</p>}
        {tip > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <HandCoins className="size-4 shrink-0 text-emerald-600" aria-hidden />
            <span>
              You tipped {name} <strong className="tabular-nums">{formatPeso(tip)}</strong>
              {tipMethod && ` with ${ONLINE_LABEL[tipMethod]}`}.
            </span>
          </p>
        )}
      </section>
    );
  }
  if (!open) return null;

  const shown = hover || rating;
  const choices = rating >= 4 ? RIDER_PRAISE : RIDER_ISSUES;
  const tipAmount = tipChoice === "other" ? Math.floor(Number(otherTip) || 0) : tipChoice;

  function pickStars(n: number) {
    // Praise and issues are different lists, so a change across 3↔4 starts the picks over
    if (n >= 4 !== rating >= 4) setTags([]);
    setRating(n);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) return setError("Tap a star to rate.");
    if (tipChoice === "other" && (tipAmount < 1 || tipAmount > MAX_TIP)) return setError(`Enter a tip from ₱1 to ₱${MAX_TIP}.`);
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ tipMethod: string | null }>(`/orders/${orderId}/rider-rating`, {
      method: "POST",
      body: { rating, tags, comment: comment.trim() || undefined, tip: tipAmount, tipMethod: tipAmount ? way : undefined },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (tipAmount) {
      celebrate({ title: "Salamat sa tip!", message: `${name} got your ₱${tipAmount} tip, paid with ${result.data.tipMethod}.` });
    } else {
      toast.success(`Thanks for rating ${name}!`, "Your rating helps riders and other residents.");
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="min-w-0 rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/70 to-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Bike className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">How was {name}&apos;s delivery?</h2>
          <p className="truncate text-sm text-muted">{rider.vehicle ?? "Your rider"}</p>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">Stars for {name}</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="cursor-pointer rounded-lg p-1 transition hover:scale-110 has-focus-visible:outline-2 has-focus-visible:outline-brand-500"
            >
              <input type="radio" name="rider-rating" value={n} checked={rating === n} onChange={() => pickStars(n)} className="sr-only" />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}
              </span>
              <Star className={`size-8 transition ${n <= shown ? "fill-amber-400 text-amber-400" : "fill-white text-gray-300"}`} strokeWidth={1.5} aria-hidden />
            </label>
          ))}
          <span aria-live="polite" className="ml-2 text-sm font-semibold text-ink">
            {LABELS[shown]}
          </span>
        </div>
      </fieldset>

      {rating > 0 && (
        <div className="mt-3 space-y-4 motion-safe:animate-[rise-in_0.3s_ease-out]">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">{rating >= 4 ? "What went well?" : "What went wrong?"}</legend>
            <div className="flex flex-wrap gap-2">
              {choices.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <label
                    key={tag}
                    className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                      on ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-white text-ink hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setTags(on ? tags.filter((t) => t !== tag) : [...tags, tag])}
                      className="sr-only"
                    />
                    {on && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                    {tag}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <TextareaField
            label="Comment (optional)"
            name="rider-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder={rating >= 4 ? `Say thanks to ${name}` : "What should the rider do better?"}
          />

          <fieldset className="min-w-0">
            <legend className="text-sm font-medium text-ink">Add a tip for {name}</legend>
            <p className="mb-2 text-[13px] text-muted">Optional. All of it goes to {name}.</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {([0, ...TIP_AMOUNTS, "other"] as const).map((choice) => {
                const on = tipChoice === choice;
                return (
                  <label
                    key={choice}
                    className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                      on ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "border-line bg-white text-ink hover:border-gray-300"
                    }`}
                  >
                    <input type="radio" name="tip" checked={on} onChange={() => setTipChoice(choice)} className="sr-only" />
                    {choice === 0 ? "No tip" : choice === "other" ? "Other" : `₱${choice}`}
                  </label>
                );
              })}
            </div>
            {tipChoice === "other" && (
              <label className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
                <span className="text-[15px] font-semibold text-muted">₱</span>
                <span className="sr-only">Tip amount in pesos</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TIP}
                  step={1}
                  value={otherTip}
                  onChange={(e) => setOtherTip(e.target.value)}
                  placeholder={`1 to ${MAX_TIP}`}
                  autoFocus
                  className="h-full w-full bg-transparent text-[15px] text-ink tabular-nums outline-none placeholder:text-gray-400"
                />
              </label>
            )}
          </fieldset>

          {tipAmount > 0 &&
            (paidWith ? (
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <Banknote className="size-4 shrink-0" aria-hidden />
                Paid with {ONLINE_LABEL[paidWith]}, like your order.
              </p>
            ) : (
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm font-medium text-ink">Pay the tip with</legend>
                <p className="-mt-1 mb-2 text-[13px] text-muted">You paid this order in cash, so choose an e-wallet or card for the tip.</p>
                <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                  {TIP_WAYS.map((option) => {
                    const on = way === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex shrink-0 snap-start cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-2 transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                          on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line bg-white hover:border-gray-300"
                        }`}
                      >
                        <input type="radio" name="tip-way" checked={on} onChange={() => setWay(option.value as OnlinePayment)} className="sr-only" />
                        <span className="flex h-8 w-14 items-center justify-center rounded-md bg-white ring-1 ring-line" aria-hidden>
                          {option.tile && <PaymentLogo file={option.tile} tint={option.brand} className="h-5 w-10" />}
                        </span>
                        <span className="text-xs font-semibold whitespace-nowrap text-ink">{option.name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={busy} className="mt-4 w-full" disabled={!rating}>
        {tipAmount > 0 ? `Rate and tip ₱${tipAmount}` : `Rate ${name}`}
      </Button>
    </form>
  );
}
