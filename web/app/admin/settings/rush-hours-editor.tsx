"use client";

import { CalendarDays, Plus, Sun, Trash2 } from "lucide-react";
import { formatPeso, renderTime } from "@/lib/format";

/** A rush hour: from and to are Philippine time ("11:00"); days are 0 = Sunday to 6 = Saturday. */
export type PeakWindow = { name: string; from: string; to: string; days: number[] };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const PRESETS = [
  { label: "Every day", days: EVERY_DAY },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
];
const MAX = 6;

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clock12 = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h)) return time;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/** The rush hour the Philippine time falls in now, with the same rule the server uses at checkout */
function current(windows: PeakWindow[], now: number) {
  const manila = new Date(now + 8 * 3600_000);
  const day = manila.getUTCDay();
  const minute = manila.getUTCHours() * 60 + manila.getUTCMinutes();
  const clock = `${String(manila.getUTCHours()).padStart(2, "0")}:${String(manila.getUTCMinutes()).padStart(2, "0")}`;
  const active = windows.find((w) => w.days.includes(day) && minute >= minutesOf(w.from) && minute < minutesOf(w.to));
  return { active, day, clock };
}

/**
 * The admin's rush hours. The system applies them by itself: at each checkout it checks the
 * Philippine time, and inside a rush hour it adds the rush-hour add-on to the delivery fee.
 */
export function RushHoursEditor({
  value,
  onChange,
  peakFee,
  errors,
}: {
  value: PeakWindow[];
  onChange: (next: PeakWindow[]) => void;
  peakFee: number;
  errors?: string[];
}) {
  const now = current(value, renderTime());
  const update = (i: number, patch: Partial<PeakWindow>) => onChange(value.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const toggleDay = (i: number, day: number) => {
    const days = value[i]!.days;
    update(i, { days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b) });
  };
  const input =
    "h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Rush hours</h3>
          <p className="text-sm text-muted">Philippine time. The system checks the time at each checkout and adds the add-on by itself.</p>
        </div>
        {/* What residents are charged right now, with the hours as typed */}
        <p
          aria-live="polite"
          suppressHydrationWarning
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            now.active && peakFee > 0 ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-canvas text-muted ring-1 ring-line"
          }`}
        >
          <span className={`size-2 rounded-full ${now.active && peakFee > 0 ? "bg-amber-500" : "bg-gray-400"}`} aria-hidden />
          {DAY_NAMES[now.day]} {clock12(now.clock)}:{" "}
          {now.active && peakFee > 0 ? `${now.active.name} now (+${formatPeso(peakFee)})` : now.active ? `${now.active.name}, but the add-on is ₱0` : "normal hours now"}
        </p>
      </div>

      {value.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">No rush hours: delivery costs the same all day.</p>
      ) : (
        <ul className="space-y-2.5">
          {value.map((w, i) => (
            <li key={i} className="rounded-xl border border-line bg-white p-3.5">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[10rem] flex-1">
                  <span className="mb-1 block text-xs font-semibold text-muted">Name</span>
                  <input className={`${input} w-full`} value={w.name} maxLength={30} onChange={(e) => update(i, { name: e.target.value })} placeholder="Lunch rush" />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-muted">Starts</span>
                  <input type="time" className={input} value={w.from} onChange={(e) => update(i, { from: e.target.value })} aria-label={`${w.name || "Rush hour"} starts`} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-muted">Ends</span>
                  <input type="time" className={input} value={w.to} onChange={(e) => update(i, { to: e.target.value })} aria-label={`${w.name || "Rush hour"} ends`} />
                </label>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-red-600 transition hover:border-red-200 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <Trash2 className="size-4" aria-hidden />
                  Remove
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label={`Days for ${w.name || "this rush hour"}`}>
                <CalendarDays className="mr-0.5 size-4 text-muted" aria-hidden />
                {DAYS.map((label, day) => {
                  const on = w.days.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      aria-label={DAY_NAMES[day]}
                      onClick={() => toggleDay(i, day)}
                      className={`h-8 min-w-11 rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                        on ? "bg-ink text-white" : "border border-line bg-white text-muted hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                <span className="mx-1 h-4 w-px bg-line" aria-hidden />
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => update(i, { days: p.days })}
                    className="rounded-md px-1.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                <Sun className="size-3.5" aria-hidden />
                {w.days.length === 0
                  ? "Pick at least one day."
                  : `+${formatPeso(peakFee)} from ${clock12(w.from)} to ${clock12(w.to)}, ${PRESETS.find((p) => p.days.join() === w.days.join())?.label.toLowerCase() ?? w.days.map((d) => DAYS[d]).join(", ")}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {errors?.length ? (
        <ul className="space-y-1 text-sm text-red-600" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {value.length < MAX && (
        <button
          type="button"
          onClick={() => onChange([...value, { name: value.length ? "Rush hour" : "Lunch rush", from: "11:00", to: "13:00", days: EVERY_DAY }])}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3.5 text-sm font-semibold text-ink transition hover:border-brand-500 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Plus className="size-4" aria-hidden />
          Add a rush hour
        </button>
      )}
    </div>
  );
}
