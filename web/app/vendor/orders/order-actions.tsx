"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/api-client";
import type { Fulfillment, OrderStatus } from "@/lib/types";

type Step = "accept" | "preparing" | "ready" | "complete";

/** The next step(s) the store can take for an order. */
export function OrderActions({
  orderId,
  status,
  fulfillment,
  riderName,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  riderName?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  async function run(step: Step | "reject", body?: unknown) {
    setBusy(step);
    setError(undefined);
    const result = await apiRequest(`/vendor/orders/${orderId}/${step}`, { method: "POST", body });
    setBusy(null);
    if (!result.ok) {
      setError(result.fieldErrors?.reason?.[0] ?? result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  const small = "h-9 px-4 text-sm";
  let actions: React.ReactNode = null;
  if (status === "PLACED")
    actions = (
      <>
        <Button variant="secondary" className={small} onClick={() => setRejecting(true)}>
          Decline
        </Button>
        <Button className={small} loading={busy === "accept"} onClick={() => run("accept")}>
          Accept order
        </Button>
      </>
    );
  else if (status === "ACCEPTED")
    actions = (
      <>
        <Button variant="secondary" className={small} loading={busy === "ready"} onClick={() => run("ready")}>
          Mark ready
        </Button>
        <Button className={small} loading={busy === "preparing"} onClick={() => run("preparing")}>
          Start preparing
        </Button>
      </>
    );
  else if (status === "PREPARING")
    actions = (
      <Button className={small} loading={busy === "ready"} onClick={() => run("ready")}>
        Mark ready
      </Button>
    );
  else if (status === "READY" && fulfillment === "PICKUP")
    actions = (
      <Button className={small} loading={busy === "complete"} onClick={() => run("complete")}>
        Collected by customer
      </Button>
    );
  else if (status === "READY")
    actions = <p className="text-sm text-muted">{riderName ? `${riderName} is coming to pick it up` : "Waiting for a rider to accept"}</p>;
  else if (status === "PICKED_UP") actions = <p className="text-sm text-muted">Out for delivery with {riderName}</p>;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions}
      {error && !rejecting && <p className="w-full text-right text-xs text-red-600">{error}</p>}
      <Dialog open={rejecting} onClose={() => setRejecting(false)} title="Decline this order?" description="The resident sees your reason. Any reserved stock goes back to your menu.">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run("reject", { reason })) setRejecting(false);
          }}
        >
          <TextareaField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We ran out of rice for today."
            autoFocus
            error={error}
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
              Keep it
            </Button>
            <Button type="submit" loading={busy === "reject"} className="bg-red-600 hover:bg-red-700">
              Decline order
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
