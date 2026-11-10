import { formatPeso } from "@/lib/format";
import type { DeliveryQuote } from "@/lib/types";

/** "3.4 km by road", or why there's no distance */
export function distanceText(quote: DeliveryQuote) {
  if (quote.km === null) return "No map pin, so the base fee applies";
  return `${quote.km.toFixed(1)} km ${quote.byRoad ? "by road" : "(estimated)"}`;
}

/** How the fee was worked out, part by part, in words a resident can check. */
export function feeParts(quote: DeliveryQuote) {
  const parts = [`${formatPeso(quote.base)} for the first ${quote.baseKm} km`];
  if (quote.extraKm > 0) parts.push(`${formatPeso(quote.distanceFee)} for ${quote.extraKm} more km (${formatPeso(quote.perKm)} each)`);
  if (quote.peak && quote.peakFee > 0) parts.push(`${formatPeso(quote.peakFee)} ${quote.peak.toLowerCase()} add-on`);
  return parts;
}

/** One store's delivery: the distance and fee, with the working shown underneath. */
export function DeliveryFeeLine({ storeName, quote }: { storeName?: string; quote: DeliveryQuote }) {
  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-muted">
          {storeName ? <span className="font-medium text-ink">{storeName} · </span> : null}
          {distanceText(quote)}
        </span>
        <span className="shrink-0 text-ink tabular-nums">{formatPeso(quote.fee)}</span>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">{feeParts(quote).join(" + ")}</p>
    </div>
  );
}
