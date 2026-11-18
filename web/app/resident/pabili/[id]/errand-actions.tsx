"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import type { ErrandStatus } from "../errand";

/** Cancel while nobody took it yet; raise the budget until the rider has bought everything. */
export function ErrandActions({ id, status, budget, budgetMax }: { id: string; status: ErrandStatus; budget: number; budgetMax: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(String(Math.min(budgetMax, budget + 100)));

  async function call(path: string, body?: object) {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/errands/${id}/${path}`, { method: "POST", body });
    setBusy(false);
    if (!result.ok) {
      setError(result.fieldErrors?.budget?.[0] ?? result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  const canRaise = (status === "REQUESTED" || status === "ACCEPTED") && budget < budgetMax;
  if (status !== "REQUESTED" && !canRaise) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {canRaise && (
        <Button variant="secondary" className="flex-1" onClick={() => setRaising(true)}>
          Raise the budget
        </Button>
      )}
      {status === "REQUESTED" && (
        <Button
          variant="secondary"
          className="flex-1 text-red-700"
          loading={busy && !raising}
          onClick={async () => {
            if (await call("cancel")) toast.success("Pabili cancelled", "You won't pay anything.");
          }}
        >
          Cancel Pabili
        </Button>
      )}
      {error && !raising && <p className="w-full text-sm text-red-600">{error}</p>}
      <Dialog open={raising} onClose={() => setRaising(false)} title="Raise the budget" description={`Now ${formatPeso(budget)}. The rider can spend up to the new amount; you still pay only what the receipt says.`}>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("budget", { budget: Number(amount) })) {
              setRaising(false);
              toast.success("Budget raised", `The rider can now spend up to ${formatPeso(Number(amount))}.`);
            }
          }}
          className="space-y-3"
        >
          <TextField label="New budget" type="number" inputMode="decimal" min={budget} max={budgetMax} value={amount} onChange={(e) => setAmount(e.target.value)} hint={`Up to ₱${budgetMax.toLocaleString("en-PH")}.`} error={error} />
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setRaising(false)}>
              Keep it
            </Button>
            <Button type="submit" loading={busy}>
              Raise budget
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
