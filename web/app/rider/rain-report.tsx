"use client";

import { CloudRain } from "lucide-react";
import { useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type RainState = { rain: { on: boolean; reports: number }; reported: boolean; fee: number };

/**
 * "It's raining here": two riders saying so within half an hour add the rain add-on to new orders
 * for an hour. All of it goes to the rider, like the busy add-on.
 */
export function RainReport() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<RainState>("/rider/rain", reload);
  const [sending, setSending] = useState(false);
  if (!data || data.fee <= 0) return null;

  async function report() {
    setSending(true);
    const result = await apiRequest<RainState>("/rider/rain", { method: "POST" });
    setSending(false);
    if (!result.ok) return void toast.error("Couldn't send it", result.error);
    toast.success(
      result.data.rain.on ? "Rain add-on is on" : "Thanks, it's noted",
      result.data.rain.on ? `New orders pay you ${formatPeso(data!.fee)} more while it rains.` : "When one more rider says it's raining, new orders pay riders more.",
    );
    setReload((n) => n + 1);
  }

  const on = data.rain.on;
  return (
    <section aria-label="Rain" className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 ${on ? "border-sky-200 bg-sky-50" : "border-line bg-white"}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${on ? "bg-sky-100 text-sky-700" : "bg-canvas text-gray-500"}`}>
        <CloudRain className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{on ? `Raining: +${formatPeso(data.fee)} on new orders` : "Is it raining where you are?"}</p>
        <p className="text-[0.8125rem] text-muted">
          {on ? "All of it is yours. It turns off by itself after an hour." : data.reported ? "You said it's raining. One more rider turns on the add-on." : `Two riders saying so adds ${formatPeso(data.fee)} to new orders, all for the rider.`}
        </p>
      </div>
      {!on && !data.reported && (
        <button
          type="button"
          onClick={report}
          disabled={sending}
          className="h-10 shrink-0 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-70"
        >
          It&apos;s raining
        </button>
      )}
    </section>
  );
}
