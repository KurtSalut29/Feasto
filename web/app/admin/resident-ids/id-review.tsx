"use client";

import { BadgeCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";

const REASONS = ["The photo is blurry or cut off.", "The name doesn't match the account.", "This isn't a valid ID.", "The ID has expired."];

/** Verify, or turn down with the reason the resident reads */
export function IdReview({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"VERIFIED" | "REJECTED" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  async function decide(decision: "VERIFIED" | "REJECTED") {
    setBusy(decision);
    const result = await apiRequest(`/admin/resident-ids/${id}/review`, { method: "POST", body: decision === "REJECTED" ? { decision, note } : { decision } });
    setBusy(null);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast.error("Couldn't save that", result.error);
      return;
    }
    toast.success(decision === "VERIFIED" ? "ID verified" : "ID turned down", name);
    setRejecting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("VERIFIED")} loading={busy === "VERIFIED"} disabled={busy !== null}>
          <BadgeCheck className="size-4" aria-hidden />
          Verify
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
          <XCircle className="size-4 text-red-600" aria-hidden />
          Not accepted
        </Button>
      </div>
      <Dialog open={rejecting} onClose={() => setRejecting(false)} title={`Turn down ${name}'s ID`} description="They read this, and can send another photo from their Home.">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void decide("REJECTED");
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
            <Button type="submit" loading={busy === "REJECTED"}>
              Turn down
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
