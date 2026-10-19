"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

/** Mark a confirmed booking as completed, no-show, or cancel it. */
export function BookingActions({ bookingId, started }: { bookingId: string; started: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function set(status: "COMPLETED" | "NO_SHOW" | "CANCELLED") {
    setBusy(status);
    const result = await apiRequest(`/vendor/bookings/${bookingId}/status`, { method: "POST", body: { status } });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const button = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition hover:bg-canvas disabled:opacity-50";
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {started ? (
        <>
          <button type="button" className={button} disabled={busy !== null} onClick={() => set("COMPLETED")}>
            Arrived
          </button>
          <button type="button" className={`${button} text-red-600`} disabled={busy !== null} onClick={() => set("NO_SHOW")}>
            No-show
          </button>
        </>
      ) : (
        <button type="button" className={`${button} text-red-600`} disabled={busy !== null} onClick={() => set("CANCELLED")}>
          Cancel
        </button>
      )}
      {error && <p className="w-full text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
