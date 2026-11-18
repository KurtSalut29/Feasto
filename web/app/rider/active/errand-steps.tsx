"use client";

import { Banknote, Camera, LoaderCircle, ReceiptText, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { celebrate } from "@/components/app/celebrate";
import { Button } from "@/components/ui/button";
import { uploadPhoto } from "@/components/ui/image-upload";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import { ProofOfDelivery } from "./delivery-actions";

/**
 * The rider's next step on a Pabili: at the shop, the receipt's photo and total (it can't be more
 * than the budget; the customer can raise it); at the door, the delivery photo.
 */
export function ErrandSteps({ id, status, budget, fee }: { id: string; status: "ACCEPTED" | "BOUGHT"; budget: number; fee: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function take(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      setPhoto(await uploadPhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  async function bought() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ fee: number; collect: number; feeChanged: boolean }>(`/rider/errands/${id}/bought`, {
      method: "POST",
      body: { receiptPhotoUrl: photo, receiptTotal: Number(total) },
    });
    setBusy(false);
    if (!result.ok) return setError(result.fieldErrors?.receiptTotal?.[0] ?? result.fieldErrors?.receiptPhotoUrl?.[0] ?? result.error);
    toast.success(
      "Receipt sent",
      result.data.feeChanged
        ? `The shop wasn't where the customer pinned it, so your fee is now ${formatPeso(result.data.fee)}. Collect ${formatPeso(result.data.collect)}.`
        : `Now bring it to the customer and collect ${formatPeso(result.data.collect)}.`,
    );
    router.refresh();
  }

  async function delivered(photoUrl: string) {
    setBusy(true);
    const result = await apiRequest<{ earned: number; collect: number }>(`/rider/errands/${id}/delivered`, { method: "POST", body: { photoUrl } });
    setBusy(false);
    if (!result.ok) return toast.error("Couldn't finish the Pabili", result.error);
    celebrate({ title: "Pabili delivered!", message: `You collected ${formatPeso(result.data.collect)}. ${formatPeso(result.data.earned)} of it is your fee.` });
    router.refresh();
  }

  if (status === "BOUGHT") return <ProofOfDelivery busy={busy} onDelivered={delivered} />;

  const amount = Number(total) || 0;
  const over = amount > budget;
  return (
    <section className="rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
        <ReceiptText className="size-4 text-brand-600" aria-hidden />
        At the shop
      </p>
      <p className="mt-1 text-sm text-muted">Buy the list (up to {formatPeso(budget)}), then take a photo of the receipt and enter its total. The customer sees both.</p>

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading || busy}
        aria-label={photo ? "Retake the receipt photo" : "Take the receipt photo"}
        className={`relative mt-3 block aspect-[4/3] w-full overflow-hidden rounded-xl transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
          photo ? "bg-canvas" : "border-2 border-dashed border-gray-300 bg-canvas text-muted hover:border-brand-500 hover:text-brand-700"
        }`}
      >
        {photo ? (
          <Image src={photo} alt="Receipt photo" fill unoptimized className="object-contain" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2">
            <Camera className="size-8" aria-hidden />
            <span className="text-[0.9375rem] font-semibold">Photo of the receipt</span>
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <LoaderCircle className="size-7 animate-spin text-brand-600" aria-hidden />
          </span>
        )}
        {photo && !uploading && (
          <span className="absolute right-2 bottom-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
            <RotateCcw className="size-3.5" aria-hidden />
            Retake
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void take(file);
          e.target.value = "";
        }}
      />

      <TextField
        className="mt-3"
        label="The receipt's total"
        type="number"
        inputMode="decimal"
        icon={Banknote}
        min={1}
        max={budget}
        value={total}
        onChange={(e) => setTotal(e.target.value)}
        placeholder="0.00"
        error={over ? `That's over the ${formatPeso(budget)} budget. Call the customer: they can raise it in the app.` : undefined}
        hint={amount ? `Collect ${formatPeso(amount + fee)} in cash: the receipt plus your ${formatPeso(fee)} fee.` : undefined}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <Button className="mt-3 w-full" loading={busy} disabled={!photo || uploading || !amount || over} onClick={bought}>
        Bought everything
      </Button>
    </section>
  );
}
