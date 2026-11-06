"use client";

import { Check, Copy, RefreshCw, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

/** The store's code for its riders, with Copy and "make a new one". */
export function RiderCode({ code }: { code: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function renew() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest("/vendor/rider-code", { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAsking(false);
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted">Your store&apos;s code for riders</p>
        <p className="mt-0.5 font-mono text-2xl font-bold tracking-wider text-ink">{code}</p>
        <p className="mt-1 text-sm text-muted">Give this only to your own riders. They enter it when they sign up.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="h-9 px-4 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setAsking(true)}>
          <RefreshCw className="size-4" aria-hidden />
          New code
        </Button>
      </div>
      <Dialog open={asking} onClose={() => setAsking(false)} title="Make a new code?" description="The old code stops working. Riders who already joined stay with your store.">
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={renew}>
            Make a new code
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** Lets a rider go from this store. They can then apply to the admin as a free rider. */
export function RemoveRiderButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/vendor/riders/${id}/remove`, { method: "POST" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAsking(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setAsking(true)}>
        <UserMinus className="size-4" aria-hidden />
        Remove
      </Button>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title={`Remove ${name} from your store?`}
        description="They stop getting your store's jobs. A Feasto admin will review them as a free rider."
      >
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button loading={busy} onClick={remove} className="bg-red-600 hover:bg-red-700">
            Remove
          </Button>
        </div>
      </Dialog>
    </>
  );
}
