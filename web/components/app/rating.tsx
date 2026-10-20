import { Star } from "lucide-react";

/** "★ 4.8 (12)" next to a store, or "New" before its first rating. */
export function RatingBadge({ rating, count, className = "" }: { rating: number | null; count: number; className?: string }) {
  if (rating === null) {
    return <span className={`inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 ${className}`}>New</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-semibold text-ink ${className}`}>
      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
      {rating.toFixed(1)}
      <span className="font-normal text-muted">
        ({count}
        <span className="sr-only"> ratings</span>)
      </span>
    </span>
  );
}

/** Five stars, filled up to `value`. */
export function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= value ? "fill-amber-400 text-amber-400" : "fill-gray-200 text-gray-200"}`} aria-hidden />
      ))}
    </span>
  );
}
