"use client";

import { CalendarClock, Zap } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SelectField } from "@/components/ui/select-field";
import { clockOf, SCHEDULE_DAYS, sendAtOf, type ScheduleDay } from "@/lib/schedule";
import type { Fulfillment } from "@/lib/types";

const list = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * As soon as possible, or a time later: a day, then a time on it. The times already fit every
 * store's hours. When a store in the cart is closed right now, only "later" is offered.
 */
export function WhenPicker({
  days,
  later,
  onLater,
  value,
  onChange,
  fulfillment,
  storeNames,
  closedNow,
}: {
  days: ScheduleDay[];
  later: boolean;
  onLater: (later: boolean) => void;
  /** The chosen time, as ISO */
  value: string | null;
  onChange: (iso: string) => void;
  fulfillment: Fulfillment;
  storeNames: string[];
  /** Stores in the cart that are closed right now */
  closedNow: string[];
}) {
  const day = days.find((d) => d.times.some((t) => t.iso === value)) ?? days[0];

  function pickDay(next: ScheduleDay) {
    // Keep the same time of day when the new day has it
    const clock = value ? clockOf(value) : null;
    onChange((next.times.find((t) => t.label === clock) ?? next.times[0]).iso);
  }

  return (
    <div>
      {closedNow.length > 0 ? (
        <Alert tone="pending">
          {list(closedNow)} {closedNow.length === 1 ? "is" : "are"} closed right now, so choose a time when {closedNow.length === 1 ? "it's" : "they're"} open.
        </Alert>
      ) : (
        <SegmentedControl
          name="when"
          legend="When do you want it?"
          value={later ? "LATER" : "NOW"}
          onChange={(v) => onLater(v === "LATER")}
          options={[
            { value: "NOW", label: "As soon as possible", Icon: Zap },
            { value: "LATER", label: "Schedule", Icon: CalendarClock },
          ]}
        />
      )}

      {later &&
        (!day ? (
          <div className="mt-3">
            <Alert tone="error">
              No time in the next {SCHEDULE_DAYS} days fits the opening hours of {storeNames.length > 1 ? "every store in your cart" : storeNames[0]}. Remove a store, or choose
              Pickup.
            </Alert>
          </div>
        ) : (
          <div className="mt-3 space-y-3 motion-safe:animate-[rise-in_0.3s_ease-out]">
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-sm font-medium text-ink">Day</legend>
              <div className="grid grid-cols-3 gap-2">
                {days.map((d) => {
                  const on = d.date === day.date;
                  return (
                    <label
                      key={d.date}
                      className={`flex h-14 cursor-pointer flex-col items-center justify-center rounded-xl border text-center transition has-focus-visible:outline-2 has-focus-visible:outline-brand-500 ${
                        on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line bg-white hover:border-gray-300"
                      }`}
                    >
                      <input type="radio" name="schedule-day" checked={on} onChange={() => pickDay(d)} className="sr-only" />
                      <span className={`text-sm font-semibold ${on ? "text-brand-700" : "text-ink"}`}>{d.label.split(",")[0]}</span>
                      <span className="text-[11px] text-muted">
                        {d.times[0].label}–{d.times.at(-1)!.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <SelectField
              label={fulfillment === "DELIVERY" ? "Deliver at" : "Ready for pickup at"}
              placeholder="Choose a time"
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              options={day.times.map((t) => ({ value: t.iso, label: `${day.label}, ${t.label}` }))}
            />
            {value && (
              <p className="flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
                <span>
                  {fulfillment === "DELIVERY" ? <>Arrives around <strong>{clockOf(value)}</strong>.</> : <>Ready for pickup at <strong>{clockOf(value)}</strong>.</>}{" "}
                  {storeNames.length > 1 ? "The stores get" : `${storeNames[0]} gets`} it at {clockOf(sendAtOf(value, fulfillment))} to start on it. You can cancel any time before then.
                </span>
              </p>
            )}
          </div>
        ))}
    </div>
  );
}
