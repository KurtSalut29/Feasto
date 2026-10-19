"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";

/** Online/Offline switch in the rider's top bar. Only approved riders can go online. */
export function AvailabilityToggle({ online: initial, approved }: { online: boolean; approved: boolean }) {
  const router = useRouter();
  const [online, setOnline] = useState(initial);
  const [busy, setBusy] = useState(false);

  if (!approved) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
        <span className="size-2 rounded-full bg-gray-400" aria-hidden />
        Offline
      </span>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      aria-label="Available for deliveries"
      disabled={busy}
      onClick={async () => {
        const next = !online;
        setOnline(next);
        setBusy(true);
        const result = await apiRequest("/rider/availability", { method: "PATCH", body: { isOnline: next } });
        setBusy(false);
        if (!result.ok) setOnline(!next);
        else router.refresh();
      }}
      className={`inline-flex h-8 items-center gap-2 rounded-full pr-1 pl-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
        online ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {online ? "Online" : "Offline"}
      <span className={`relative h-6 w-10 rounded-full transition ${online ? "bg-emerald-500" : "bg-gray-300"}`}>
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition ${online ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
