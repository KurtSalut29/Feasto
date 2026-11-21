"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import type { Fulfillment, JobDispatch, OrderStatus } from "@/lib/types";

type Step = "accept" | "preparing" | "ready" | "complete" | "delay";

/** Choices for how long until it's ready; the estimate is added when it isn't one of them */
const READY_IN = [10, 15, 20, 30, 45, 60, 90, 120];
const MORE_TIME = [10, 15, 20, 30];
const DELAY_REASONS = ["Many orders right now", "Waiting for an ingredient", "A big order takes longer", "Cooking it fresh"];
const inWords = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m / 60} hr`);

/** Who a delivery job has reached so far, in the store's words. */
const LOOKING_FOR_RIDER: Record<JobDispatch, string> = {
  NEW: "Looking for a rider…",
  PREFERRED: "Asking the rider the customer chose",
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
  estimateMinutes,
}: {
  orderId: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  riderName?: string;
  dispatch: JobDispatch;
  /** The rider has their own live panel next to these buttons, so don't repeat who's coming */
  riderShown?: boolean;
  /** Feasto's estimate from the store's kitchen time and the number of items */
  estimateMinutes?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [accepting, setAccepting] = useState(false);
  const [minutes, setMinutes] = useState(estimateMinutes ?? 20);
  const [delaying, setDelaying] = useState(false);
  const [more, setMore] = useState(15);
  const [why, setWhy] = useState(DELAY_REASONS[0]!);
  const choices = [...new Set([...READY_IN, ...(estimateMinutes ? [estimateMinutes] : [])])].sort((a, b) => a - b);

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
      accept: ["Order accepted", "The resident sees when it will be ready. Start preparing when you're ready."],
      delay: ["More time given", "The resident was told the new time and why."],
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
        <Button className={small} loading={busy === "accept"} onClick={() => setAccepting(true)}>
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

  const late = status === "ACCEPTED" || status === "PREPARING";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions}
      {late && (
        <Button variant="secondary" className={side} onClick={() => setDelaying(true)}>
          Need more time
        </Button>
      )}
      {/* While it's being prepared the store still wants to know who's coming */}
      {fulfillment === "DELIVERY" && !riderShown && (status === "ACCEPTED" || status === "PREPARING") && (
        <p className="w-full text-xs text-muted">{riderName ? `${riderName} will pick it up` : LOOKING_FOR_RIDER[dispatch]}</p>
      )}
      {error && !rejecting && !accepting && !delaying && <p className="w-full text-xs text-red-600">{error}</p>}
      <Dialog open={accepting} onClose={() => setAccepting(false)} title="When will it be ready?" description="The customer sees this time right away. Feasto picked its estimate from your kitchen time and the number of items.">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {choices.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                aria-pressed={minutes === m}
                className={`h-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${minutes === m ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-ink hover:bg-canvas"}`}
              >
                {inWords(m)}
                {m === estimateMinutes && <span className="sr-only"> (estimate)</span>}
              </button>
            ))}
          </div>
          {estimateMinutes && <p className="text-xs text-muted">Feasto&apos;s estimate: {inWords(estimateMinutes)}.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setAccepting(false)}>
              Not yet
            </Button>
            <Button
              loading={busy === "accept"}
              onClick={async () => {
                if (await run("accept", { minutes })) setAccepting(false);
              }}
            >
              Accept: ready in {inWords(minutes)}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog open={delaying} onClose={() => setDelaying(false)} title="Need more time?" description="The customer is told the new time and why. After the second time, they may cancel for free.">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">How much more</legend>
            <div className="grid grid-cols-4 gap-2">
              {MORE_TIME.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMore(m)}
                  aria-pressed={more === m}
                  className={`h-11 rounded-xl border text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${more === m ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-ink hover:bg-canvas"}`}
                >
                  +{m} min
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Why</legend>
            <div className="flex flex-wrap gap-2">
              {DELAY_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setWhy(r)}
                  aria-pressed={why === r}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${why === r ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-white text-ink hover:bg-canvas"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setDelaying(false)}>
              Cancel
            </Button>
            <Button
              loading={busy === "delay"}
              onClick={async () => {
                if (await run("delay", { minutes: more, reason: why })) setDelaying(false);
              }}
            >
              Tell the customer +{more} min
            </Button>
          </div>
        </div>
      </Dialog>
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
