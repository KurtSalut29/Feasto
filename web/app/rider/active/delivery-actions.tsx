"use client";

import { Camera, LoaderCircle, RotateCcw } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { uploadPhoto } from "@/components/ui/image-upload";
import { apiRequest } from "@/lib/api-client";
import type { OrderStatus } from "@/lib/types";

export function DeliveryActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function step(path: "picked-up" | "delivered", body?: object) {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/rider/active/${orderId}/${path}`, { method: "POST", body });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <div>
      {status === "READY" && (
        <Button className="w-full" loading={busy} onClick={() => step("picked-up")}>
          I picked up the order
        </Button>
      )}
      {status === "PICKED_UP" && <ProofOfDelivery busy={busy} onDelivered={(photoUrl) => step("delivered", { photoUrl })} />}
      {(status === "ACCEPTED" || status === "PREPARING") && (
        <p className="rounded-xl bg-canvas px-4 py-3 text-center text-sm text-muted">
          Head to the store. You can pick it up once they mark it ready.
        </p>
      )}
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}

/** Photo of the handed-over order, required before the delivery can be finished. Opens the back camera on phones. */
function ProofOfDelivery({ busy, onDelivered }: { busy: boolean; onDelivered: (photoUrl: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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

  return (
    <section className="rounded-2xl border border-line p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Proof of delivery</p>
      <p className="mt-1 text-sm text-muted">Hand the order over, then take a photo of it. The customer and the store will see it.</p>

      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={uploading || busy}
        aria-label={photo ? "Retake the delivery photo" : "Take the delivery photo"}
        className={`relative mt-3 block aspect-[4/3] w-full overflow-hidden rounded-xl transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
          photo ? "bg-canvas" : "border-2 border-dashed border-gray-300 bg-canvas text-muted hover:border-brand-500 hover:text-brand-700"
        }`}
      >
        {photo ? (
          <Image src={photo} alt="Delivery photo" fill unoptimized className="object-cover" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2">
            <Camera className="size-8" aria-hidden />
            <span className="text-[15px] font-semibold">Take a photo</span>
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
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Button
        className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700"
        loading={busy}
        disabled={!photo || uploading}
        onClick={() => photo && onDelivered(photo)}
      >
        Delivered to the customer
      </Button>
    </section>
  );
}
