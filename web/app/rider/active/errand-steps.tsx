"use client";

import { Banknote, Camera, IdCard, LoaderCircle, ReceiptText, RotateCcw } from "lucide-react";
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

/** A photo taken with the camera and uploaded at once, with a retake */
function PhotoBox({ label, photo, onPhoto, disabled }: { label: string; photo: string | null; onPhoto: (url: string) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  async function take(file: File) {
    setError(undefined);
    setUploading(true);
    try {
      onPhoto(await uploadPhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading || disabled}
        aria-label={photo ? `Retake: ${label}` : `Take a photo: ${label}`}
        className={`relative block aspect-[4/3] w-full overflow-hidden rounded-xl transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
          photo ? "bg-canvas" : "border-2 border-dashed border-gray-300 bg-canvas text-muted hover:border-brand-500 hover:text-brand-700"
        }`}
      >
        {photo ? (
          <Image src={photo} alt={label} fill unoptimized className="object-contain" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
            <Camera className="size-7" aria-hidden />
            <span className="text-sm font-semibold">{label}</span>
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
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

/**
 * The rider's next step on a Pabili: at the shop, a photo of what was bought and of the receipt,
 * and the receipt's total (never more than the budget; the customer can raise it); at the door,
 * the ID check when alcohol or cigarettes were bought, then the delivery photo.
 */
export function ErrandSteps({ id, status, budget, fee, feeMax, adultBought, prepaid = false }: { id: string; status: "ACCEPTED" | "BOUGHT"; budget: number; fee: number; feeMax: number; adultBought: boolean; prepaid?: boolean }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<string | null>(null);
  const [goods, setGoods] = useState<string | null>(null);
  const [total, setTotal] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function bought() {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ fee: number; collect: number; fromGps: boolean }>(`/rider/errands/${id}/bought`, {
      method: "POST",
      body: { receiptPhotoUrl: receipt, itemsPhotoUrl: goods, receiptTotal: Number(total) },
    });
    setBusy(false);
    if (!result.ok) return setError(result.fieldErrors?.receiptTotal?.[0] ?? result.fieldErrors?.receiptPhotoUrl?.[0] ?? result.fieldErrors?.itemsPhotoUrl?.[0] ?? result.error);
    toast.success(
      "Receipt sent",
      prepaid
        ? `Your fee is ${formatPeso(result.data.fee)}. It's paid online: collect nothing, Feasto pays you back after you deliver.`
        : result.data.fromGps
          ? `Your fee from here to the customer is ${formatPeso(result.data.fee)}. Bring it over and collect ${formatPeso(result.data.collect)}.`
          : `Your location wasn't shared, so the lowest fee applies (${formatPeso(result.data.fee)}). Collect ${formatPeso(result.data.collect)}.`,
    );
    router.refresh();
  }

  async function delivered(photoUrl: string) {
    if (adultBought && !idChecked) return void toast.error("Check their ID first", "Alcohol and cigarettes are only for 18 and older.");
    setBusy(true);
    const result = await apiRequest<{ earned: number; collect: number; paidBack: string | null }>(`/rider/errands/${id}/delivered`, { method: "POST", body: { photoUrl, idChecked: adultBought ? idChecked : undefined } });
    setBusy(false);
    if (!result.ok) return void toast.error("Couldn't finish the Pabili", result.error);
    celebrate({
      title: "Pabili delivered!",
      message: result.data.paidBack
        ? `Feasto is sending you ${formatPeso(result.data.paidBack)}: what you spent plus your ${formatPeso(result.data.earned)} fee.`
        : `You collected ${formatPeso(result.data.collect)}. ${formatPeso(result.data.earned)} of it is your fee.`,
    });
    router.refresh();
  }

  if (status === "BOUGHT") {
    return (
      <>
        {adultBought && (
          <label className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${idChecked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <IdCard className="size-4" aria-hidden />
                I checked their ID: 18 or older
              </span>
              The name matches the customer and they&apos;re 18 or older. If not, don&apos;t hand over the alcohol or cigarettes: call Feasto through &ldquo;Report a problem&rdquo;.
            </span>
          </label>
        )}
        <ProofOfDelivery busy={busy} onDelivered={delivered} />
      </>
    );
  }

  const amount = Number(total) || 0;
  const over = amount > budget;
  return (
    <section className="rounded-2xl border border-line p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
        <ReceiptText className="size-4 text-brand-600" aria-hidden />
        At the shop
      </p>
      <p className="mt-1 text-sm text-muted">
        Buy the list (up to {formatPeso(budget)}). Mark anything you couldn&apos;t buy on the list. Then take a photo of what you bought and of the receipt, and enter its total. The customer sees all of
        it. Tap &ldquo;Bought everything&rdquo; while you&apos;re still at the shop, with your location on: your fee ({fee === feeMax ? formatPeso(fee) : `${formatPeso(fee)} to ${formatPeso(feeMax)}`}) is
        worked out from there to the customer.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <PhotoBox label="What you bought" photo={goods} onPhoto={setGoods} disabled={busy} />
        <PhotoBox label="The receipt" photo={receipt} onPhoto={setReceipt} disabled={busy} />
      </div>

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
        hint={amount ? (prepaid ? "Paid online: Feasto pays you back the receipt plus your fee after you deliver." : `You collect the receipt plus your fee, at most ${formatPeso(amount + feeMax)} in cash.`) : undefined}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <Button className="mt-3 w-full" loading={busy} disabled={!receipt || !goods || !amount || over} onClick={bought}>
        Bought everything
      </Button>
    </section>
  );
}
