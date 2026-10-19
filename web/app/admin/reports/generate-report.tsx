"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { apiRequest } from "@/lib/api-client";
import { manilaDate } from "@/lib/format";

const PRESETS = { today: 0, week: 6, month: 29 } as const;
type Preset = keyof typeof PRESETS;

/** Starts a sales report; the workers compute it and the page shows it when ready. */
export function GenerateReport() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>("week");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-80 max-w-full">
        <SegmentedControl
          name="range"
          legend="Report period"
          value={preset}
          onChange={setPreset}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "Last 7 days" },
            { value: "month", label: "Last 30 days" },
          ]}
        />
      </div>
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const result = await apiRequest<{ id: string }>("/admin/reports", {
            method: "POST",
            body: { from: manilaDate(-PRESETS[preset]), to: manilaDate() },
          });
          setBusy(false);
          if (!result.ok) return setError(result.error);
          router.push(`/admin/reports?id=${result.data.id}`);
        }}
      >
        Generate report
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
