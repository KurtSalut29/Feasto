"use client";

import { Check, Copy, RefreshCw, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";

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
    toast.success("New rider code made", "Share it with riders you want to join. The old code no longer works.");
    router.refresh();
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">
            Your store&apos;s code for riders
          </p>
          {/* One tile per character, easy to read out over the phone */}
          <p
            className="mt-2 flex flex-wrap gap-1.5"
            aria-label={`Code ${code.split("").join(" ")}`}
          >
            {code.split("").map((char, i) =>
              char === "-" ? (
                <span
                  key={i}
                  aria-hidden
                  className="flex w-3 items-center justify-center text-xl font-bold text-gray-300"
                >
                  –
                </span>
              ) : (
                <span
                  key={i}
                  aria-hidden
                  className="flex h-12 w-10 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 font-mono text-2xl font-bold text-brand-700"
                >
                  {char}
                </span>
              ),
            )}
          </p>
          <p className="mt-2 text-sm text-muted">
            Give this only to your own riders. Anyone with it can ask to ride
            for you.
          </p>
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
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="secondary"
            className="h-9 px-4 text-sm"
            onClick={() => setAsking(true)}
          >
            <RefreshCw className="size-4" aria-hidden />
            New code
          </Button>
        </div>
      </div>
      {/* How a rider joins, in order */}
      <ol className="grid border-t border-line bg-canvas/50 sm:grid-cols-3 sm:divide-x sm:divide-line">
        {[
          ["Share the code", "Send it to your rider by text or chat."],
          [
            "They sign up as a rider",
            "With their license and motorcycle, entering this code.",
          ],
          [
            "You approve them",
            "Check their license below, then approve. Your orders reach them first.",
          ],
        ].map(([title, text], i) => (
          <li key={title} className="flex gap-3 px-5 py-3.5">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                {title}
              </span>
              <span className="block text-xs text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Make a new code?"
        description="The old code stops working. Riders who already joined stay with your store."
      >
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAsking(false)}
          >
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
    const result = await apiRequest(`/vendor/riders/${id}/remove`, {
      method: "POST",
    });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setAsking(false);
    toast.success(`${name} is no longer your rider`, "They can apply to Feasto as a free rider.");
    router.refresh();
  }

  return (
    <>
      <Button
        variant="secondary"
        className="h-9 px-4 text-sm"
        onClick={() => setAsking(true)}
      >
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAsking(false)}
          >
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={remove}
            className="bg-red-600 hover:bg-red-700"
          >
            Remove
          </Button>
        </div>
      </Dialog>
    </>
  );
}
