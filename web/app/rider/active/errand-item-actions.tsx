"use client";

import { CircleSlash, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { NOT_BOUGHT, notBoughtLabel, type NotBoughtReason, type PabiliItem } from "@/lib/pabili";

const reasonsFor = (item: PabiliItem) =>
  NOT_BOUGHT.filter((r) => (r.value === "NEEDS_PRESCRIPTION" ? item.flags?.includes("PRESCRIPTION") || item.prescription : r.value === "AGE_CHECK" ? item.flags?.some((f) => f === "ALCOHOL" || f === "TOBACCO") : true));

/** At the shop: "Couldn't buy this", with why (or undo). The customer is told at once. */
export function NotBoughtButton({ errandId, index, item }: { errandId: string; index: number; item: PabiliItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function mark(reason: NotBoughtReason | null) {
    setBusy(true);
    const result = await apiRequest(`/rider/errands/${errandId}/items/${index}/not-bought`, { method: "POST", body: { reason } });
    setBusy(false);
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    setOpen(false);
    if (reason) toast.info(`${item.name}: ${notBoughtLabel(reason).toLowerCase()}`, "The customer was told.");
    router.refresh();
  }

  if (item.notBought) {
    return (
      <button type="button" disabled={busy} onClick={() => mark(null)} className="mt-1 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-brand-700 hover:underline">
        <Undo2 className="size-3.5" aria-hidden />
        Found it after all
      </button>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-muted hover:text-red-700 hover:underline">
        <CircleSlash className="size-3.5" aria-hidden />
        Couldn&apos;t buy this
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Couldn't buy ${item.name}?`} description="Say why. The customer is told right away, and you buy the rest.">
        <div className="grid gap-2">
          {reasonsFor(item).map((r) => (
            <Button key={r.value} variant="secondary" disabled={busy} onClick={() => mark(r.value)} className="justify-start">
              {r.label}
            </Button>
          ))}
        </div>
      </Dialog>
    </>
  );
}

/** Nothing on the list could be bought: the Pabili ends and nobody pays */
export function NothingBought({ errandId }: { errandId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function end(reason: NotBoughtReason) {
    setBusy(true);
    const result = await apiRequest(`/rider/errands/${errandId}/nothing-bought`, { method: "POST", body: { reason } });
    setBusy(false);
    if (!result.ok) return void toast.error("Couldn't end it", result.error);
    toast.info("Pabili ended", "The customer was told that nothing could be bought.");
    router.refresh();
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-muted hover:text-red-700 hover:underline">
        Nothing on the list could be bought
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="End this Pabili?" description="Only when nothing at all could be bought. The customer pays nothing, and there's no fee. Call them first: maybe another shop has it.">
        <div className="grid gap-2">
          {NOT_BOUGHT.filter((r) => r.value !== "TOO_BIG").map((r) => (
            <Button key={r.value} variant="secondary" disabled={busy} onClick={() => end(r.value)} className="justify-start">
              {r.label}
            </Button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
