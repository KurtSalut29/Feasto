"use client";

import { CloudRain, TrafficCone } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type Rain = { on: boolean; by: "admin" | "riders" | null; until: string | null; reports: number };
type Live = { rain: Rain; demand: { waiting: number; freeRiders: number }; busy: { fee: number; reason: string | null }; rainFee: number };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/**
 * What the add-ons are right now, from the real counts, with the admin's rain switch. The switch
 * works at once, apart from the Save button: it's about the weather now, not a setting.
 */
export function LiveAddOns() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Live>("/admin/rain", reload);
  const [busy, setBusy] = useState(false);

  async function switchRain(on: boolean) {
    setBusy(true);
    const result = await apiRequest("/admin/rain", { method: "PUT", body: { on, hours: 3 } });
    setBusy(false);
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    toast.success(on ? "Rain add-on on for 3 hours" : "Rain add-on off", on ? "New orders show it, with the reason, before they're placed." : "New orders are priced without it.");
    setReload((n) => n + 1);
  }

  const rain = data?.rain;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-canvas px-3 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <TrafficCone className="size-4 text-brand-600" aria-hidden />
          Right now
        </p>
        {data ? (
          <>
            <p className="mt-1 text-sm text-ink tabular-nums">
              {data.demand.waiting} order{data.demand.waiting === 1 ? "" : "s"} waiting · {data.demand.freeRiders} free rider{data.demand.freeRiders === 1 ? "" : "s"}
            </p>
            <p className="text-sm text-muted">{data.busy.fee > 0 ? `Busy add-on: +${formatPeso(data.busy.fee)}` : "No busy add-on: there are enough riders."}</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Counting…</p>
        )}
      </div>
      <div className={`rounded-xl px-3 py-3 ${rain?.on ? "bg-sky-50 ring-1 ring-sky-200" : "bg-canvas"}`}>
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CloudRain className={`size-4 ${rain?.on ? "text-sky-600" : "text-gray-500"}`} aria-hidden />
          {rain?.on ? `Raining: +${formatPeso(data?.rainFee ?? 0)}` : "Not raining"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {!rain
            ? "Checking…"
            : rain.on
              ? `${rain.by === "riders" ? "Turned on by riders' reports" : "You turned it on"}, until ${rain.until ? time(rain.until) : "later"}.`
              : rain.reports > 0
                ? `${rain.reports} rider said it's raining. One more turns it on.`
                : "Riders can report rain from their app."}
        </p>
        <Button variant="secondary" className="mt-2 h-9 w-full text-sm" loading={busy} onClick={() => switchRain(!rain?.on)} disabled={!rain}>
          {rain?.on ? "Turn off" : "It's raining: turn on for 3 hours"}
        </Button>
      </div>
    </div>
  );
}
