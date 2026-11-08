"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMinutes, minutesSince } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { waitTone } from "./queue";

const TONE = {
  calm: "bg-canvas text-muted",
  soon: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  late: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

/**
 * How long ago the order was placed, ticking every half minute. It turns amber, then red, when
 * the order has waited too long for its stage. `renderedAt` is the server's clock, so the first
 * paint matches what the server sent.
 */
export function WaitClock({ since, status, renderedAt }: { since: string; status: OrderStatus; renderedAt: number }) {
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const minutes = minutesSince(since, now);
  const tone = waitTone(status, minutes);
  return (
    <span
      title={tone === "late" ? "Waiting too long" : tone === "soon" ? "Getting long" : "Since the order was placed"}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${TONE[tone]}`}
    >
      <Clock className="size-3.5" aria-hidden />
      {formatMinutes(minutes)}
      {tone === "late" && <span className="sr-only"> (waiting too long)</span>}
    </span>
  );
}
