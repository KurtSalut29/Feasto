"use client";

import { RotateCcw, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Stars } from "@/components/app/rating";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/api-client";

const LABELS = ["", "Bad", "Not great", "Okay", "Good", "Excellent!"];

/** "How was it?" card on a received order, or the rating already given. */
export function RateOrder({
  orderId,
  storeName,
  review,
}: {
  orderId: string;
  storeName: string;
  review: { rating: number; comment: string | null } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (review) {
    return (
      <section className="rounded-2xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">Your rating</h2>
        <div className="mt-2 flex items-center gap-2">
          <Stars value={review.rating} size="size-5" />
          <span className="text-sm font-medium text-muted">{LABELS[review.rating]}</span>
        </div>
        {review.comment && <p className="mt-2 text-sm text-ink">“{review.comment}”</p>}
      </section>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!rating) return setError("Tap a star to rate.");
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/orders/${orderId}/review`, { method: "POST", body: { rating, comment: comment.trim() || undefined } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-4">
      <h2 className="font-semibold text-ink">How was your order?</h2>
      <p className="mt-0.5 text-sm text-muted">Your rating helps {storeName} and other residents.</p>
      <fieldset className="mt-3">
        <legend className="sr-only">Stars</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHover(n)}
              className="cursor-pointer rounded-lg p-1 transition hover:scale-110 has-focus-visible:outline-2 has-focus-visible:outline-brand-500"
            >
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}
              </span>
              <Star
                className={`size-8 transition ${n <= shown ? "fill-amber-400 text-amber-400" : "fill-white text-gray-300"}`}
                strokeWidth={1.5}
                aria-hidden
              />
            </label>
          ))}
          <span aria-live="polite" className="ml-2 text-sm font-semibold text-ink">
            {LABELS[shown]}
          </span>
        </div>
      </fieldset>
      {rating > 0 && (
        <div className="mt-3 space-y-3">
          <TextareaField
            label="Comment (optional)"
            name="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="What did you like? What could be better?"
          />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={busy} className="mt-3 w-full" disabled={!rating}>
        Submit rating
      </Button>
    </form>
  );
}

/** Puts the same dishes back in the cart and opens it. */
export function ReorderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  async function reorder() {
    setBusy(true);
    setMessage(undefined);
    const result = await apiRequest<{ added: string[]; skipped: string[] }>(`/orders/${orderId}/reorder`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return setMessage(result.error);
    if (result.data.skipped.length) {
      // Say what's missing, then let them continue to the cart themselves
      return setMessage(`Added to cart. Not available right now: ${result.data.skipped.join(", ")}.`);
    }
    router.push("/resident/cart");
  }

  return (
    <div>
      <Button type="button" variant="secondary" loading={busy} onClick={reorder} className="w-full">
        {!busy && <RotateCcw className="size-[18px]" aria-hidden />}
        Order again
      </Button>
      {message && (
        <p role="status" className="mt-2 text-center text-sm text-muted">
          {message}{" "}
          {message.startsWith("Added") && (
            <Link href="/resident/cart" className="font-semibold text-brand-700 underline-offset-4 hover:underline">
              Go to cart
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
