"use client";

import { Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";

const CHOICES = [15, 30, 45, 60] as const;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/**
 * Busy kitchen: instead of declining orders when the kitchen is full, every new order takes a
 * little longer for the next two hours. Residents see the longer time before they order.
 */
export function BusyKitchen({ minutes, until }: { minutes: number; until: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState<number | null>(null);

  async function set(next: number) {
    setSaving(next);
    const result = await apiRequest("/vendor/store/busy", { method: "PUT", body: { minutes: next, hours: 2 } });
    setSaving(null);
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    toast.success(next ? `Busy kitchen: +${next} min` : "Busy kitchen off", next ? "New orders show the longer time for the next 2 hours." : "New orders use your usual kitchen time.");
    router.refresh();
  }

  const on = minutes > 0;
  return (
    <section aria-label="Busy kitchen" className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${on ? "border-amber-200 bg-amber-50" : "border-line bg-white"}`}>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${on ? "bg-amber-100 text-amber-700" : "bg-canvas text-gray-500"}`}>
        <Flame className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-semibold text-ink">{on ? `Busy kitchen: +${minutes} min on new orders` : "Kitchen full?"}</p>
        <p className="text-[0.8125rem] text-muted">{on && until ? `Until ${clock(until)}. Residents see the longer time before they order.` : "Add time to every new order instead of declining them."}</p>
      </div>
      <div className="flex w-full gap-1.5 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
        {CHOICES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set(m)}
            disabled={saving !== null}
            aria-pressed={minutes === m}
            className={`h-9 rounded-lg border px-2.5 text-sm font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60 ${minutes === m ? "border-amber-500 bg-amber-100 text-amber-900" : "border-line bg-white text-ink hover:bg-canvas"}`}
          >
            +{m}
          </button>
        ))}
        {on && (
          <button
            type="button"
            onClick={() => set(0)}
            disabled={saving !== null}
            className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60"
          >
            Off
          </button>
        )}
      </div>
    </section>
  );
}
