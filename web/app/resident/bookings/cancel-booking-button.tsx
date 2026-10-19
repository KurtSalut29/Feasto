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
      <Button variant="secondary" className="h-9 w-full text-sm text-red-600" onClick={() => setOpen(true)}>
        Cancel booking
      </Button>
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
