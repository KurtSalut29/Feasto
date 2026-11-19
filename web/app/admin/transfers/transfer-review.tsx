"use client";

import { BadgeCheck, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

const REASONS = [
  "It isn't in the account's history.",
  "The amount is different from the order's total.",
  "The reference number doesn't match the receipt.",
  "The receipt looks edited.",
];

/**
 * Confirm only after finding the transfer in the account's own history (the GCash or bank app),
 * with the same amount and reference number. The screenshot alone isn't proof.
 */
export function TransferReview({ checkoutId, amount, to }: { checkoutId: string; amount: number; to: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  async function decide(which: "confirm" | "reject") {
    setBusy(which);
    const result = await apiRequest(`/admin/transfers/${checkoutId}/${which}`, { method: "POST", body: which === "reject" ? { note } : {} });
    setBusy(null);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast.error("Couldn't save that", result.error);
      return;
    }
    toast.success(which === "confirm" ? "Payment confirmed" : "Marked as not found", which === "confirm" ? "The orders went to their stores." : "The order was cancelled and the resident was told why.");
    setConfirming(false);
    setRejecting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setConfirming(true)} disabled={busy !== null}>
          <BadgeCheck className="size-4" aria-hidden />
          Found it, confirm
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setNote("");
            setErrors({});
            setRejecting(true);
          }}
          disabled={busy !== null}
        >
          <SearchX className="size-4 text-red-600" aria-hidden />
          Not found
        </Button>
      </div>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title={`Confirm ${formatPeso(amount)}?`} description={`Only if you found it in the history of ${to}, with this amount and reference number.`}>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Check again
          </Button>
          <Button onClick={() => void decide("confirm")} loading={busy === "confirm"}>
            Yes, it&apos;s there
          </Button>
        </div>
      </Dialog>

      <Dialog open={rejecting} onClose={() => setRejecting(false)} title="The transfer wasn't found" description="The order is cancelled and the resident reads why. If they did send money, they can report it from the order.">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void decide("reject");
          }}
        >
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setNote(r)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500 ${note === r ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line text-ink hover:bg-canvas"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <TextareaField label="What's wrong" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={200} required error={errors.note?.[0]} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === "reject"}>
              Cancel the order
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
