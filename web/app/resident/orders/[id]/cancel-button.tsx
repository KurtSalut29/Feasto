"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <>
      <Button variant="secondary" className="w-full text-red-600" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Cancel this order?" description="You can cancel until the store accepts it.">
        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep order
          </Button>
          <Button
            loading={busy}
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              setBusy(true);
              const result = await apiRequest(`/orders/${orderId}/cancel`, { method: "POST" });
              setBusy(false);
              if (!result.ok) return setError(result.error);
              setOpen(false);
              router.refresh();
            }}
          >
            Cancel order
          </Button>
        </div>
      </Dialog>
    </>
  );
}
