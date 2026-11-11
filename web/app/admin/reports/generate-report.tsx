"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateRangeButton, type Period } from "@/components/ui/date-range-picker";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { addDays, formatRange, manilaDate } from "@/lib/format";

/** Starts a sales report for any period; the workers compute it and the page shows it when ready. */
export function GenerateReport() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>(() => ({ from: addDays(manilaDate(), -6), to: manilaDate() }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DateRangeButton value={period} onChange={setPeriod} disabled={busy} />
      <Button
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const result = await apiRequest<{ id: string }>("/admin/reports", { method: "POST", body: period });
          setBusy(false);
          if (!result.ok) {
            const message = result.fieldErrors?.to?.[0] ?? result.fieldErrors?.from?.[0] ?? result.error;
            toast.error("Couldn't start the report", message);
            return setError(message);
          }
          toast.info("Making your report", `The workers are adding up each store's sales for ${formatRange(period.from, period.to)}. It shows here in a few seconds.`);
          router.push(`/admin/reports?id=${result.data.id}`);
        }}
      >
        Generate report
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
