"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";

export function AcceptJobButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div>
      <Button
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const result = await apiRequest(`/rider/jobs/${orderId}/accept`, { method: "POST" });
          setBusy(false);
          if (!result.ok) {
            setError(result.error);
            router.refresh(); // the job may be gone; show the current list
            return;
          }
          router.push("/rider/active");
        }}
      >
        Accept job
      </Button>
      {error && <p className="mt-1.5 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
