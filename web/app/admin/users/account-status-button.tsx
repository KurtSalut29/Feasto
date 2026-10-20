"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

/** Disable (with confirmation) or re-enable an account. */
export function AccountStatusButton({ userId, name, disabled }: { userId: string; name: string; disabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function change(nextDisabled: boolean) {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/admin/users/${userId}/status`, { method: "POST", body: { disabled: nextDisabled } });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setConfirming(false);
    router.refresh();
  }

  if (disabled) {
    return (
      <button
        type="button"
        onClick={() => change(false)}
        disabled={busy}
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        {busy ? "Enabling…" : "Enable"}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        Disable
      </button>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Disable ${name}?`}
        description="They're logged out on every device right away and can't log in until you enable the account again. A vendor's store is hidden from residents."
      >
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Keep active
          </Button>
          <Button loading={busy} className="bg-red-600 hover:bg-red-700" onClick={() => change(true)}>
            Disable account
          </Button>
        </div>
      </Dialog>
    </>
  );
}
