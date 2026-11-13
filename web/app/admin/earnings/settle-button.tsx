"use client";

import { HandCoins } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatDate, formatPeso } from "@/lib/format";

/** What a store or rider still owes Feasto from cash orders */
export type OpenBalance = {
  id: string;
  name: string;
  owed: number;
  /** Finished cash orders since the last time it was collected */
  orders: number;
  lastSettledAt: string | null;
};

/**
 * Records that the admin received Feasto's share of a store's or rider's cash orders. Asks first,
 * and sends the amount it showed: if a cash order finished in between, the server says so
 * instead of recording a different amount.
 */
export function SettleButton({ party, kind }: { party: OpenBalance; kind: "store" | "rider" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const amount = formatPeso(party.owed);

  async function settle() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest("/admin/earnings/settle", {
      method: "POST",
      body: { [kind === "store" ? "vendorId" : "riderId"]: party.id, expected: party.owed },
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setOpen(false);
    toast.success(`Received ${amount} from ${party.name}`, "What they owe Feasto is back to ₱0.");
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" className="h-9 shrink-0 px-3 text-sm" onClick={() => setOpen(true)}>
        <HandCoins className="size-4" aria-hidden />
        Collect
        <span className="sr-only"> from {party.name}</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Collect from ${party.name}`}>
        <div className="mt-5 rounded-xl border border-line px-4 py-3">
          <p className="text-sm text-muted">{party.name} pays Feasto</p>
          <p className="text-2xl font-bold text-ink tabular-nums">{amount}</p>
          <p className="mt-1 text-sm text-muted">
            Feasto&apos;s share of {party.orders} cash {party.orders === 1 ? "order" : "orders"}{" "}
            {party.lastSettledAt ? `since ${formatDate(party.lastSettledAt)}` : "so far"}. {kind === "store" ? "The store" : "The rider"} kept the cash, so this part is
            Feasto&apos;s to collect.
          </p>
        </div>
        <p className="mt-3 text-sm text-muted">Mark it after you receive the money. They get a notification, and what they owe goes back to ₱0.</p>
        {error && (
          <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={settle}>
            Mark {amount} as received
          </Button>
        </div>
      </Dialog>
    </>
  );
}
