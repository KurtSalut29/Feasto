"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";
import type { OrderStatus } from "@/lib/types";

export function DeliveryActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function step(path: "picked-up" | "delivered") {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest(`/rider/active/${orderId}/${path}`, { method: "POST" });
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
      {status === "PICKED_UP" && (
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700" loading={busy} onClick={() => step("delivered")}>
          Delivered to the customer
        </Button>
      )}
      {(status === "ACCEPTED" || status === "PREPARING") && (
        <p className="rounded-xl bg-canvas px-4 py-3 text-center text-sm text-muted">
          Head to the store. You can pick it up once they mark it ready.
        </p>
      )}
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
