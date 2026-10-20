"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg px-2 py-1 text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        Cancel
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel this booking?" description="The table is released for someone else.">
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            loading={busy}
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              setBusy(true);
              const result = await apiRequest(`/bookings/${bookingId}/cancel`, { method: "POST" });
              setBusy(false);
              if (!result.ok) return setError(result.error);
              setOpen(false);
              router.refresh();
            }}
          >
            Cancel booking
          </Button>
        </div>
      </Dialog>
    </>
  );
}
