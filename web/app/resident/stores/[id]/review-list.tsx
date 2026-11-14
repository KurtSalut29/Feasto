"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Stars } from "@/components/app/rating";
import { timeAgo } from "@/lib/format";
import type { StoreReview } from "@/lib/types";

const FIRST_SHOWN = 3;

/** What residents wrote, newest first: a few at first, the rest one tap away. */
export function ReviewList({ reviews }: { reviews: StoreReview[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? reviews : reviews.slice(0, FIRST_SHOWN);
  return (
    <>
      <ul className="mt-3 divide-y divide-line">
        {shown.map((review) => (
          <li key={review.id} className="flex gap-3 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700" aria-hidden>
              {review.author[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-semibold text-ink">{review.author}</p>
                <p className="shrink-0 text-xs text-gray-500">{timeAgo(review.createdAt)}</p>
              </div>
              <div className="mt-0.5">
                <Stars value={review.rating} size="size-3.5" />
              </div>
              {review.comment && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink">{review.comment}</p>}
            </div>
          </li>
        ))}
      </ul>
      {reviews.length > FIRST_SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          {all ? "Show fewer" : `Show all ${reviews.length} reviews`}
          <ChevronDown className={`size-4 transition ${all ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </>
  );
}
