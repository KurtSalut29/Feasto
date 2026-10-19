"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/api-client";
import type { ApprovalStatus } from "@/lib/types";

type Decision = "APPROVED" | "REJECTED" | "SUSPENDED";

/** Approve / reject / suspend / reinstate buttons for one store or rider. */
export function ReviewActions({
  kind,
  id,
  name,
  status,
}: {
  kind: "stores" | "riders";
  id: string;
  name: string;
  status: ApprovalStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Decision | null>(null);
  const [asking, setAsking] = useState<"REJECTED" | "SUSPENDED" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  async function review(decision: Decision, reason?: string) {
    setPending(decision);
    setError(undefined);
    const result = await apiRequest(`/admin/${kind}/${id}/review`, {
      method: "POST",
      body: { decision, note: reason },
    });
    setPending(null);
    if (!result.ok) {
      setError(result.fieldErrors?.note?.[0] ?? result.error);
      return;
    }
    setAsking(null);
    setNote("");
    router.refresh();
  }

  const subject = kind === "stores" ? "store" : "rider";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {(status === "PENDING" || status === "REJECTED" || status === "SUSPENDED") && (
        <Button className="h-9 px-4 text-sm" loading={pending === "APPROVED"} onClick={() => review("APPROVED")}>
          {status === "SUSPENDED" ? "Reinstate" : "Approve"}
        </Button>
      )}
      {status === "PENDING" && (
        <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setAsking("REJECTED")}>
          Reject
        </Button>
      )}
      {status === "APPROVED" && (
        <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setAsking("SUSPENDED")}>
          Suspend
        </Button>
      )}
      {error && !asking && <p className="w-full text-right text-xs text-red-600">{error}</p>}

      <Dialog
        open={asking !== null}
        onClose={() => {
          setAsking(null);
          setError(undefined);
        }}
        title={asking === "REJECTED" ? `Reject ${name}?` : `Suspend ${name}?`}
        description={
          asking === "REJECTED"
            ? `The ${subject} will see your reason, so they know what to fix.`
            : `The ${subject} stops ${kind === "stores" ? "appearing to residents" : "receiving jobs"} until you reinstate it.`
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (asking) void review(asking, note);
          }}
          className="space-y-4"
        >
          <TextareaField
            label="Reason"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={asking === "REJECTED" ? "e.g. The store address is incomplete." : "e.g. Several customer complaints."}
            autoFocus
            error={error}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending !== null} className="bg-red-600 hover:bg-red-700">
              {asking === "REJECTED" ? "Reject" : "Suspend"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
