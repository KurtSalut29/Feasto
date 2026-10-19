"use client";

import { LoaderCircle, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

/** "Add" button that turns into a − 2 + stepper. Saves each change to the cart. */
export function QuantityControl({
  menuItemId,
  name,
  quantity: initial,
  disabled,
  compact,
}: {
  menuItemId: string;
  name: string;
  quantity: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function change(next: number) {
    const previous = quantity;
    setQuantity(next); // show it right away; undo if the server refuses
    setBusy(true);
    setError(undefined);
    const result = await apiRequest("/cart/items", { method: "PUT", body: { menuItemId, quantity: next } });
    setBusy(false);
    if (!result.ok) {
      setQuantity(previous);
      setError(result.error);
      return;
    }
    router.refresh(); // updates the cart badge and totals
  }

  const size = compact ? "size-8" : "size-9";

  return (
    <div className="flex flex-col items-end">
      {quantity === 0 ? (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => change(1)}
          aria-label={`Add ${name} to cart`}
          className="inline-flex h-9 items-center gap-1 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          Add
        </button>
      ) : (
        <div className="flex items-center gap-1 rounded-full border border-line bg-white p-0.5">
          <button
            type="button"
            onClick={() => change(quantity - 1)}
            disabled={busy}
            aria-label={`Remove one ${name}`}
            className={`flex ${size} items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500`}
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="min-w-6 text-center text-sm font-semibold text-ink" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => change(quantity + 1)}
            disabled={busy || disabled}
            aria-label={`Add one more ${name}`}
            className={`flex ${size} items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:bg-gray-200 disabled:text-gray-500`}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {error && <p className="mt-1 max-w-40 text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
