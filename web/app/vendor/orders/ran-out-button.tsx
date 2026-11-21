"use client";

import { PackageX, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import type { IfUnavailable } from "@/lib/types";

/**
 * An item ran out after the order came in. What happens is what the customer chose at checkout:
 * it's taken off (and refunded if paid online), or the whole order is cancelled. "Call me first"
 * shows the number before the button.
 */
export function RanOutButton({ orderId, itemId, name, choice, phone }: { orderId: string; itemId: string; name: string; choice: IfUnavailable; phone: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ cancelled?: boolean }>(`/vendor/orders/${orderId}/items/${itemId}/unavailable`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    if (result.data.cancelled) toast.info("Order cancelled", "The customer was told why. Any online payment is refunded.");
    else toast.success(`${name} taken off`, "The customer was told, and doesn't pay for it.");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-line bg-white px-2 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        aria-label={`${name} ran out`}
      >
        <PackageX className="size-3.5" aria-hidden />
        Ran out
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${name} ran out?`}
        description={
          choice === "CANCEL"
            ? "The customer asked to cancel the whole order if something is missing. It's cancelled, and any online payment is refunded."
            : choice === "CALL"
              ? "The customer asked you to call first. Call them, then take it off if they agree."
              : "It's taken off the order. The customer doesn't pay for it, or gets it back if they paid online."
        }
      >
        {choice === "CALL" && phone && (
          <a href={`tel:${phone}`} className="mb-4 flex w-fit items-center gap-2 rounded-xl bg-canvas px-3 py-2 text-sm font-semibold text-brand-700 hover:underline">
            <Phone className="size-4" aria-hidden />
            Call {phone}
          </a>
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button loading={busy} className={choice === "CANCEL" ? "bg-red-600 hover:bg-red-700" : ""} onClick={confirm}>
            {choice === "CANCEL" ? "Cancel the order" : "Take it off"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
