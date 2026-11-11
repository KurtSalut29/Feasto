"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DateRangeButton, type Period } from "@/components/ui/date-range-picker";

/** Changes the period in the address bar, so the page (and any link to it) shows that period */
export function PeriodPicker({ value }: { value: Period }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div aria-busy={pending || undefined} className={pending ? "opacity-70 transition-opacity" : "transition-opacity"}>
      <DateRangeButton value={value} onChange={(p) => start(() => router.push(`/vendor/reports?from=${p.from}&to=${p.to}`))} />
    </div>
  );
}
