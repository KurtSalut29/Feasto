"use client";

import { Check, ChevronDown, ChevronRight, LoaderCircle, MapPin, Plus, Settings2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import type { Address } from "@/lib/types";

const chipClass =
  "relative mt-4 flex w-full items-center gap-2 rounded-full bg-white/15 py-2 pr-3 pl-2.5 text-left text-sm text-white ring-1 ring-white/30 transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/**
 * Where the food goes, as one line on Home. Tapping it opens a sheet of the saved addresses,
 * and picking one makes it the default, so "Near you", distances and fees follow at once.
 */
export function AddressSwitcher({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const current = addresses.find((a) => a.isDefault) ?? addresses[0];

  if (!current) {
    return (
      <Link href="/resident/addresses?add=1" className={chipClass}>
        <Plus className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-semibold">Add a delivery address</span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </Link>
    );
  }

  const close = () => ref.current?.close();

  async function choose(address: Address) {
    if (address.id === current.id) return close();
    setBusy(address.id);
    setError("");
    const result = await apiRequest(`/me/addresses/${address.id}`, {
      method: "PATCH",
      body: {
        label: address.label,
        details: address.details,
        landmark: address.landmark ?? undefined,
        latitude: address.latitude,
        longitude: address.longitude,
        isDefault: true,
      },
    });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    toast.success(`Delivering to ${address.label}`, "Stores, distances and delivery fees now use this address.");
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`Deliver to ${current.label}, ${current.details}. Change address`}
        onClick={() => {
          setError("");
          ref.current?.showModal();
        }}
        className={chipClass}
      >
        <MapPin className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{current.label}</span>
          <span className="text-white"> · {current.details}</span>
        </span>
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </button>

      <dialog
        ref={ref}
        aria-labelledby="address-sheet-title"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className="mx-auto mt-auto mb-0 max-h-dvh w-full max-w-[440px] bg-transparent p-0 md:my-auto md:max-w-lg md:px-4 text-ink backdrop:bg-ink/50"
      >
        <div className="flex max-h-[85dvh] flex-col rounded-t-3xl md:rounded-3xl md:starting:translate-y-6 md:starting:opacity-0 bg-white pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out starting:translate-y-full motion-reduce:transition-none">
          <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" />
          <div className="flex items-start justify-between gap-3 px-5 pt-3">
            <div>
              <h2 id="address-sheet-title" className="text-lg font-bold text-ink">
                Deliver to
              </h2>
              <p className="mt-0.5 text-sm text-muted">Stores, distances and delivery fees follow this address.</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {error && (
            <p role="alert" className="mx-5 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <ul className="mt-3 space-y-2 overflow-y-auto px-5">
            {addresses.map((address) => {
              const selected = address.id === current.id;
              return (
                <li key={address.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={busy !== null}
                    onClick={() => choose(address)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-70 ${
                      selected ? "border-brand-500 bg-brand-50" : "border-line hover:bg-canvas"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-brand-600 text-white" : "bg-canvas text-muted"}`}
                    >
                      <MapPin className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{address.label}</span>
                      <span className="block text-sm leading-snug text-ink/80">{address.details}</span>
                      {address.landmark && <span className="mt-0.5 block text-xs text-muted">Near {address.landmark}</span>}
                      {address.latitude == null && (
                        <span className="mt-0.5 block text-xs font-medium text-amber-700">No map pin yet, so distances won&apos;t show</span>
                      )}
                    </span>
                    <span className="flex size-6 shrink-0 items-center justify-center self-center">
                      {busy === address.id ? (
                        <LoaderCircle className="size-5 animate-spin text-brand-600" aria-hidden />
                      ) : selected ? (
                        <Check className="size-5 text-brand-600" aria-hidden />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line px-5 pt-3 pb-4">
            <Link
              href="/resident/addresses?add=1"
              onClick={close}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <Plus className="size-4" aria-hidden />
              Add address
            </Link>
            <Link
              href="/resident/addresses"
              onClick={close}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Settings2 className="size-4 text-brand-600" aria-hidden />
              Edit addresses
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
