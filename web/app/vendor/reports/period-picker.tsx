"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DateRangeButton, type Period } from "@/components/ui/date-range-picker";
import { formatRange } from "@/lib/format";

/** Changes the period in the address bar, so the page (and any link to it) shows that period */
export function PeriodPicker({ value }: { value: Period }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [next, setNext] = useState<Period>();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangeButton
        value={pending && next ? next : value}
        busy={pending}
        onChange={(p) => {
          setNext(p);
          start(() => router.push(`/vendor/reports?from=${p.from}&to=${p.to}`));
        }}
      />
      {pending && next && (
        <p role="status" className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 ring-1 ring-brand-100">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          Loading {formatRange(next.from, next.to)}…
        </p>
      )}
    </div>
  );
}
