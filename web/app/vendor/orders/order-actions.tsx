"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import type { Fulfillment, JobDispatch, OrderStatus } from "@/lib/types";

type Step = "accept" | "preparing" | "ready" | "complete";

/** Who a delivery job has reached so far, in the store's words. */
const LOOKING_FOR_RIDER: Record<JobDispatch, string> = {
  NEW: "Looking for a rider…",
  STORE_RIDERS: "Asking your own riders first",
  NEAREST: "Asking the riders nearest your store",
  WIDER: "Asking more riders nearby",
  EVERYONE: "Waiting for any free rider to accept",
};

/** The next step(s) the store can take for an order. */
export function OrderActions({
  orderId,
  status,
  fulfillment,
  riderName,
  dispatch,
  riderShown = false,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  riderName?: string;
  dispatch: JobDispatch;
  /** The rider has their own live panel next to these buttons, so don't repeat who's coming */
  riderShown?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  async function run(step: Step | "reject", body?: unknown) {
    setBusy(step);
    setError(undefined);
    const result = await apiRequest<{ payout?: string }>(`/vendor/orders/${orderId}/${step}`, { method: "POST", body });
    setBusy(null);
    if (!result.ok) {
      setError(result.fieldErrors?.reason?.[0] ?? result.error);
      return false;
    }
    const done = {
      accept: ["Order accepted", "The resident was told. Start preparing when you're ready."],
      preparing: ["Marked as preparing", "The resident can see you're cooking it."],
      ready: ["Ready for pickup", "We're telling the rider (or the resident, for pickup) that it's ready."],
      complete: ["Order completed", "Nice! It's moved to your history."],
      reject: ["Order declined", "The resident was told why. Any online payment is refunded."],
    } as const;
    const [title, description] = step === "complete" && result.data.payout ? [done.complete[0], result.data.payout] : done[step];
    if (step === "reject") toast.info(title, description);
    else toast.success(title, description);
    router.refresh();
    return true;
  }

  // The main step stretches; the secondary one keeps its natural width
  const small = "h-9 flex-1 px-3 text-sm whitespace-nowrap";
  const side = "h-9 px-3.5 text-sm whitespace-nowrap";
  let actions: React.ReactNode = null;
  if (status === "PLACED")
    actions = (
      <>
        <Button variant="secondary" className={side} onClick={() => setRejecting(true)}>
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
        <Button variant="secondary" className={side} loading={busy === "ready"} onClick={() => run("ready")}>
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
  else if (status === "READY" && !riderShown)
    actions = <p className="text-sm text-muted">{riderName ? `${riderName} is coming to pick it up` : LOOKING_FOR_RIDER[dispatch]}</p>;
  else if (status === "READY") actions = <p className="text-sm text-muted">Hand it over when the rider arrives.</p>;
  else if (status === "PICKED_UP" && !riderShown) actions = <p className="text-sm text-muted">Out for delivery with {riderName}</p>;
  else if (status === "PICKED_UP") actions = <p className="text-sm text-muted">Out for delivery. Nothing left for you to do.</p>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions}
      {/* While it's being prepared the store still wants to know who's coming */}
      {fulfillment === "DELIVERY" && !riderShown && (status === "ACCEPTED" || status === "PREPARING") && (
        <p className="w-full text-xs text-muted">{riderName ? `${riderName} will pick it up` : LOOKING_FOR_RIDER[dispatch]}</p>
      )}
      {error && !rejecting && <p className="w-full text-xs text-red-600">{error}</p>}
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
