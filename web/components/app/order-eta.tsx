import { Bike, ChefHat, Clock } from "lucide-react";
import type { OrderEta } from "@/lib/types";

/** "25 min", "1 hr 30 min" */
export function minutesWords(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr${h === 1 ? "" : "s"}`;
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/**
 * "Ready by 12:40 PM · Arrives about 12:55 PM", from the time the store gave when it accepted.
 * Shown to the resident, the store and the rider alike, so everyone works to the same time.
 */
export function EtaLine({ eta, ready = false, delays = 0, delayNote, className = "" }: { eta: OrderEta | undefined; ready?: boolean; delays?: number; delayNote?: string | null; className?: string }) {
  if (!eta) return null;
  return (
    <div className={`rounded-xl bg-canvas px-3 py-2.5 text-sm ${className}`}>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-ink">
          {ready ? <ChefHat className="size-4 text-emerald-600" aria-hidden /> : <Clock className="size-4 text-brand-600" aria-hidden />}
          {ready ? "Ready" : <span>Ready by <b className="tabular-nums">{clockTime(eta.readyBy)}</b></span>}
        </span>
        {eta.arriveBy && (
          <span className="flex items-center gap-1.5 text-ink">
            <Bike className="size-4 text-brand-600" aria-hidden />
            <span>
              Arrives about <b className="tabular-nums">{clockTime(eta.arriveBy)}</b>
            </span>
          </span>
        )}
      </p>
      {delays > 0 && delayNote && (
        <p className="mt-1 text-xs text-amber-800">
          The store needed more time{delays > 1 ? ` (${delays} times)` : ""}: {delayNote}
        </p>
      )}
      {eta.late && !delayNote && <p className="mt-1 text-xs text-amber-800">Running a little late.</p>}
    </div>
  );
}
