"use client";

import { Camera, DoorOpen, KeyRound, LoaderCircle, RotateCcw, UserX } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uploadPhoto } from "@/components/ui/image-upload";
import { apiRequest } from "@/lib/browser-api";
import { celebrate } from "@/components/app/celebrate";
import { toast } from "@/components/ui/toast";
import type { OrderStatus } from "@/lib/types";

export function DeliveryActions({
  orderId,
  status,
  arrivedAt = null,
  doorWaitMinutes = 10,
  needsPin = false,
  leaveAtGate = false,
}: {
  orderId: string;
  status: OrderStatus;
  arrivedAt?: string | null;
  doorWaitMinutes?: number;
  needsPin?: boolean;
  leaveAtGate?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function step(path: "picked-up" | "delivered" | "arrived" | "not-received", body?: object) {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest<{ payout?: string }>(`/rider/active/${orderId}/${path}`, { method: "POST", body });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (path === "picked-up") toast.success("Pickup confirmed", "Now bring it to the customer. They can see you on their map.");
    else if (path === "arrived") toast.success("The customer was told you're outside", "Call or chat if they don't come out.");
    else if (path === "not-received") toast.info("Marked not received", "The store and the admin were told. Bring the food back to the store.");
    else celebrate({ title: "Delivered! Nice work.", message: result.data.payout ?? "Your pay was added to today's earnings." });
    router.refresh();
  }

  return (
    <div>
      {status === "READY" && (
        <Button className="w-full" loading={busy} onClick={() => step("picked-up")}>
          I picked up the order
        </Button>
      )}
      {status === "PICKED_UP" && !arrivedAt && (
        <Button variant="secondary" className="mb-3 w-full" loading={busy} onClick={() => step("arrived")}>
          <DoorOpen className="size-5" aria-hidden />
          I&apos;m at the door
        </Button>
      )}
      {status === "PICKED_UP" && <ProofOfDelivery busy={busy} needsPin={needsPin} leaveAtGate={leaveAtGate} onDelivered={(photoUrl, pin) => step("delivered", { photoUrl, pin })} />}
      {status === "PICKED_UP" && arrivedAt && <NotReceived arrivedAt={arrivedAt} waitMinutes={doorWaitMinutes} busy={busy} onConfirm={(photoUrl) => step("not-received", { photoUrl })} />}
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
export function ProofOfDelivery({
  busy,
  onDelivered,
  needsPin = false,
  leaveAtGate = false,
}: {
  busy: boolean;
  onDelivered: (photoUrl: string, pin?: string) => void;
  needsPin?: boolean;
  leaveAtGate?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pin, setPin] = useState("");
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
    <section id="proof" className="scroll-mt-20 rounded-2xl border border-line p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Proof of delivery</p>
      <p className="mt-1 text-sm text-muted">
        {leaveAtGate
          ? "The customer asked you to leave it at the gate or door. Leave it there, then take a photo showing where."
          : "Hand the order over, then take a photo of it. The customer and the store will see it."}
      </p>

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
            <span className="text-[0.9375rem] font-semibold">Take a photo</span>
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

      {needsPin && (
        <label className="mt-3 block">
          <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <KeyRound className="size-4 text-brand-600" aria-hidden />
            Customer&apos;s PIN
          </span>
          <span className="block text-[0.8125rem] text-muted">A big order: ask for the 4-digit PIN on their order page before you hand it over.</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2.5 text-center font-mono text-xl tracking-[0.4em] text-ink focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 focus:outline-none"
          />
        </label>
      )}

      <Button
        className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700"
        loading={busy}
        disabled={!photo || uploading || (needsPin && pin.length !== 4)}
        onClick={() => photo && onDelivered(photo, needsPin ? pin : undefined)}
      >
        Delivered to the customer
      </Button>
    </section>
  );
}

/**
 * Nobody came to the door: after the wait (with calls and chat), the rider may end the delivery as
 * not received, with a photo at the door. It counts against the customer, not the rider.
 */
function NotReceived({ arrivedAt, waitMinutes, busy, onConfirm }: { arrivedAt: string; waitMinutes: number; busy: boolean; onConfirm: (photoUrl: string) => void }) {
  const opensAt = new Date(arrivedAt).getTime() + waitMinutes * 60_000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (now >= opensAt) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [now, opensAt]);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const left = Math.max(0, Math.ceil((opensAt - now) / 60_000));

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
    <section aria-label="Customer not coming" className="mt-3 rounded-2xl border border-line p-4">
      <p className="text-sm text-muted">
        {left > 0
          ? `At the door. Call and chat with the customer. If nobody comes, you can mark it not received in ${left} min.`
          : "Still no one? You waited long enough. Mark it not received, with a photo at the door."}
      </p>
      <Button variant="secondary" className="mt-3 w-full text-red-700" disabled={left > 0} onClick={() => setOpen(true)}>
        <UserX className="size-5" aria-hidden />
        Customer didn&apos;t come
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mark it not received?" description="Take a photo at the door to show you were there. The store and the admin are told, and it counts against the customer, not you.">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading || busy}
          className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-canvas text-muted transition hover:border-brand-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          {photo ? (
            <Image src={photo} alt="Photo at the door" fill unoptimized className="object-cover" />
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-2">
              <Camera className="size-8" aria-hidden />
              <span className="text-[0.9375rem] font-semibold">Take a photo at the door</span>
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70">
              <LoaderCircle className="size-7 animate-spin text-brand-600" aria-hidden />
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
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep waiting
          </Button>
          <Button className="bg-red-600 hover:bg-red-700" loading={busy} disabled={!photo || uploading} onClick={() => photo && onConfirm(photo)}>
            Not received
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
