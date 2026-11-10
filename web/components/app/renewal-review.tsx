"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";

/** Approve or reject a renewed document. `path` is where the decision goes: the admin's or a store's route. */
export function RenewalReview({ path, name }: { path: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  async function review(decision: "APPROVED" | "REJECTED") {
    setBusy(decision);
    setError(undefined);
    const result = await apiRequest(path, { method: "POST", body: { decision, note: decision === "REJECTED" ? note : undefined } });
    setBusy(null);
    if (!result.ok) {
      setError(result.fieldErrors?.note?.[0] ?? result.error);
      return;
    }
    setAsking(false);
    setNote("");
    if (decision === "APPROVED") toast.success(`${name}'s renewal approved`, "The new expiry date is saved.");
    else toast.info(`${name}'s renewal rejected`, "They were told why and can upload it again.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setAsking(true)}>
        <X className="size-4" aria-hidden />
        Reject
      </Button>
      <Button className="h-9 px-4 text-sm" loading={busy === "APPROVED"} onClick={() => review("APPROVED")}>
        {busy !== "APPROVED" && <Check className="size-4" aria-hidden />}
        Approve renewal
      </Button>
      {error && !asking && <p className="w-full text-right text-xs text-red-600">{error}</p>}

      <Dialog
        open={asking}
        onClose={() => {
          setAsking(false);
          setError(undefined);
        }}
        title={`Reject ${name}'s renewal?`}
        description="They keep the document they have now, and they'll see your reason so they can send it again."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void review("REJECTED");
          }}
          className="space-y-4"
        >
          <TextareaField label="Reason" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. The expiry date on the photo isn't readable." autoFocus error={error} />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy === "REJECTED"} className="bg-red-600 hover:bg-red-700">
              Reject
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
