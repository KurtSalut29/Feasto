"use client";

import { BellRing, UserMinus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";

type Reason = "NO_STORE_REPLY" | "NO_RIDER" | "RIDER_NOT_COLLECTING" | "ON_THE_ROAD";

/** What the admin can do about one stuck order. Which buttons appear depends on why it's stuck. */
export function StuckActions({ orderId, code, reason, riderName }: { orderId: string; code: string; reason: Reason; riderName: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ask" | "release" | "cancel" | null>(null);
  const [dialog, setDialog] = useState<"release" | "cancel" | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  async function askRiders() {
    setBusy("ask");
    setError(undefined);
    setDone(undefined);
    const result = await apiRequest<{ reached: number }>(`/admin/stuck/${orderId}/ask-riders`, { method: "POST", body: {} });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    const { reached } = result.data;
    setDone(reached === 0 ? "No riders are available right now. It stays open to everyone." : `Asked ${reached} ${reached === 1 ? "rider" : "riders"}. It's open to everyone now.`);
    if (reached === 0) toast.warning("No free riders right now", "The order stays open, so the first rider to come online can take it.");
    else toast.success(`Asked ${reached} ${reached === 1 ? "rider" : "riders"}`, "The order is open to every rider now.");
    router.refresh();
  }

  async function release() {
    setBusy("release");
    setError(undefined);
    const result = await apiRequest(`/admin/stuck/${orderId}/release-rider`, { method: "POST", body: {} });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setDialog(null);
    toast.success("Rider taken off the order", "It's open for another rider to take.");
    router.refresh();
  }

  async function cancel() {
    setBusy("cancel");
    setError(undefined);
    const result = await apiRequest(`/admin/orders/${orderId}/cancel`, { method: "POST", body: { reason: cancelReason } });
    setBusy(null);
    if (!result.ok) return setError(result.fieldErrors?.reason?.[0] ?? result.error);
    setDialog(null);
    toast.success("Order cancelled", "The resident and the store can see it was cancelled, with your reason.");
    router.refresh();
  }

  const closeDialog = () => {
    setDialog(null);
    setError(undefined);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {done && <p className="mr-auto text-sm text-muted">{done}</p>}
      {error && !dialog && <p className="mr-auto text-sm text-red-600">{error}</p>}
      <Button
        variant="secondary"
        className="h-9 px-4 text-sm text-red-600"
        onClick={() => {
          setError(undefined);
          setDialog("cancel");
        }}
      >
        <X className="size-4" aria-hidden />
        Cancel order
      </Button>
      {reason === "NO_RIDER" && (
        <Button className="h-9 px-4 text-sm" loading={busy === "ask"} onClick={askRiders}>
          {busy !== "ask" && <BellRing className="size-4" aria-hidden />}
          Ask every rider
        </Button>
      )}
      {reason === "RIDER_NOT_COLLECTING" && (
        <Button
          className="h-9 px-4 text-sm"
          onClick={() => {
            setError(undefined);
            setDialog("release");
          }}
        >
          <UserMinus className="size-4" aria-hidden />
          Give to another rider
        </Button>
      )}

      <Dialog
        open={dialog === "release"}
        onClose={closeDialog}
        title={`Take ${code} from ${riderName}?`}
        description="The job goes back to the riders, starting from the store's own. This rider goes offline until they turn themselves back on."
      >
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={closeDialog}>
            Keep this rider
          </Button>
          <Button loading={busy === "release"} onClick={release}>
            Give to another rider
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "cancel"}
        onClose={closeDialog}
        title={`Cancel ${code}?`}
        description="This can't be undone. The resident, the store and any rider see your reason. An online payment is refunded."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void cancel();
          }}
          className="space-y-4"
        >
          <TextareaField label="Reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="e.g. No rider is available in your area right now." autoFocus error={error} />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={closeDialog}>
              Keep order
            </Button>
            <Button type="submit" loading={busy === "cancel"} className="bg-red-600 hover:bg-red-700">
              Cancel order
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
