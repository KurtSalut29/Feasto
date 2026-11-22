"use client";

import { CloudLightning, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatDateTime } from "@/lib/format";

/**
 * A storm or a flood: stop new deliveries for the whole town for a few hours, so no rider is sent
 * out in it. Pickup orders and orders scheduled for after it still come in. Riders and open stores
 * are told at once; it turns itself back on when the time is up.
 */
export function DeliveryPause({ pausedUntil, reason }: { pausedUntil: string | null; reason: string | null }) {
  const router = useRouter();
  const [hours, setHours] = useState("3");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function set(on: boolean) {
    setBusy(true);
    setError(undefined);
    const result = await apiRequest("/admin/delivery-pause", { method: "PUT", body: on ? { on, hours: Number(hours), reason: why || undefined } : { on } });
    setBusy(false);
    if (!result.ok) return setError(result.fieldErrors?.hours?.[0] ?? result.error);
    toast.success(on ? "Deliveries paused" : "Deliveries are back on", on ? "Riders and open stores were told. Pickup still works." : "Residents can order deliveries again.");
    router.refresh();
  }

  return (
    <Card title="Pause deliveries" Icon={CloudLightning} description="For a storm or a flood: no new deliveries in all of Naval for a few hours, so no rider is sent out in it. Pickup still works.">
      <div className="p-5">
        {pausedUntil ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">
            <p className="text-sm">
              <span className="font-semibold">Deliveries are paused until {formatDateTime(pausedUntil)}</span>
              {reason ? ` (${reason})` : ""}. They turn back on by themselves then.
            </p>
            <Button loading={busy} onClick={() => set(false)}>
              <Play className="size-[18px]" aria-hidden />
              Turn deliveries back on
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
            <TextField label="For (hours)" type="number" inputMode="numeric" min="1" max="48" value={hours} onChange={(e) => setHours(e.target.value)} hint="1 to 48" />
            <TextField label="Reason residents see" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={120} placeholder="e.g. Typhoon signal no. 2" hint="Optional" />
            <Button variant="secondary" className="text-red-700" loading={busy} onClick={() => set(true)}>
              <CloudLightning className="size-[18px]" aria-hidden />
              Pause deliveries
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
