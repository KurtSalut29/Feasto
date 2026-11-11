"use client";

import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addDays, dayCount, formatLongDay, formatRange, manilaDate } from "@/lib/format";

/** A report period: two "YYYY-MM-DD" dates in Manila, both included */
export type Period = { from: string; to: string };

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const monthOf = (d: string) => d.slice(0, 7);
const shiftMonth = (ym: string, n: number) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  return `${y + Math.floor(m / 12)}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`;
};
const lastDayOf = (ym: string) => addDays(`${shiftMonth(ym, 1)}-01`, -1);
const monthTitle = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", month: "long", year: "numeric" });
const fullDay = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });

/** Quick picks, worked out from today in Manila */
export function periodPresets(today = manilaDate()) {
  const thisMonth = monthOf(today);
  const lastMonth = shiftMonth(thisMonth, -1);
  return [
    { id: "today", label: "Today", from: today, to: today },
    { id: "yesterday", label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { id: "7", label: "Last 7 days", from: addDays(today, -6), to: today },
    { id: "30", label: "Last 30 days", from: addDays(today, -29), to: today },
    { id: "month", label: "This month", from: `${thisMonth}-01`, to: today },
    { id: "last-month", label: "Last month", from: `${lastMonth}-01`, to: lastDayOf(lastMonth) },
    { id: "year", label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

/** The name of a preset the period matches ("Last 7 days"), if any */
export function presetName(period: Period) {
  return periodPresets().find((p) => p.from === period.from && p.to === period.to)?.label;
}

/**
 * The Feasto period picker: a button showing the period ("Oct 1 – 11, 2026 · 11 days") that opens
 * a pop-up with quick picks and a calendar. Tap a start date, then an end date, then Apply.
 */
export function DateRangeButton({ value, onChange, maxDays = 366, disabled }: { value: Period; onChange: (p: Period) => void; maxDays?: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const days = dayCount(value.from, value.to);
  const preset = presetName(value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`Report period: ${formatRange(value.from, value.to)}, ${days} ${days === 1 ? "day" : "days"}. Change`}
        className="group inline-flex h-11 max-w-full items-center gap-2.5 rounded-xl border border-line bg-white pr-3 pl-2 text-left transition hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <CalendarRange className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">{formatRange(value.from, value.to)}</span>
          <span className="block truncate text-xs text-muted">
            {preset ? `${preset} · ` : ""}
            {days} {days === 1 ? "day" : "days"}
          </span>
        </span>
        <ChevronDown className="ml-1 size-4 shrink-0 text-muted transition group-hover:text-ink" aria-hidden />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Pick the report period" description="Tap the first day, then the last day. Up to a year." wide>
        <RangeCalendar
          initial={value}
          maxDays={maxDays}
          onCancel={() => setOpen(false)}
          onApply={(p) => {
            setOpen(false);
            onChange(p);
          }}
        />
      </Dialog>
    </>
  );
}

function RangeCalendar({ initial, maxDays, onCancel, onApply }: { initial: Period; maxDays: number; onCancel: () => void; onApply: (p: Period) => void }) {
  const [today] = useState(() => manilaDate());
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState<string | null>(initial.to);
  const [hover, setHover] = useState<string | null>(null);
  // The right-hand month (the only one on phones); the left one is the month before it
  const [right, setRight] = useState(monthOf(initial.to));
  const [focused, setFocused] = useState(initial.to);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const picking = to === null;
  const latest = picking ? minDate(today, addDays(from, maxDays - 1)) : today;
  const end = to ?? (hover && hover >= from && hover <= latest ? hover : null);
  const days = to ? dayCount(from, to) : null;
  const presets = periodPresets(today);
  const activePreset = presets.find((p) => p.from === from && p.to === to)?.id;

  // Keep keyboard focus on the day the arrow keys moved to
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, right]);

  function choose(date: string) {
    if (date > latest) return;
    setFocused(date);
    if (picking && date >= from) {
      setTo(date);
    } else {
      setFrom(date);
      setTo(null);
    }
  }

  function moveFocus(event: KeyboardEvent) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = addDays(focused, step);
    if (next > today) return;
    moved.current = true;
    setFocused(next);
    if (monthOf(next) > right) setRight(monthOf(next));
    if (monthOf(next) < shiftMonth(right, -1)) setRight(shiftMonth(monthOf(next), 1));
  }

  const canGoNext = right < monthOf(today);

  return (
    <div>
      {/* The chosen period as a ticket with two stubs, like a Feasto receipt */}
      <div className="flex items-stretch overflow-hidden rounded-2xl bg-brand-50 ring-1 ring-brand-100">
        <Stub label="From" value={formatLongDay(from)} active={!picking} />
        <div aria-hidden className="relative w-0 border-l-2 border-dashed border-brand-200">
          <span className="absolute -top-2 -left-2 size-4 rounded-full bg-white" />
          <span className="absolute -bottom-2 -left-2 size-4 rounded-full bg-white" />
        </div>
        <Stub label="To" value={to ? formatLongDay(to) : "Pick the last day"} active={picking} placeholder={!to} />
      </div>
      <p aria-live="polite" className="mt-2 text-center text-xs font-medium text-brand-700">
        {days !== null ? `${formatRange(from, to!)} · ${days} ${days === 1 ? "day" : "days"}` : "Now tap the last day"}
      </p>

      <div role="group" aria-label="Quick picks" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={activePreset === p.id}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
              setFocused(p.to);
              setRight(monthOf(p.to));
            }}
            className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
              activePreset === p.id ? "bg-ink text-white" : "bg-canvas text-muted ring-1 ring-line hover:text-ink"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div ref={grid} className="relative mt-4" onKeyDown={moveFocus} onMouseLeave={() => setHover(null)}>
        <button
          type="button"
          onClick={() => setRight(shiftMonth(right, -1))}
          aria-label="Earlier month"
          className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setRight(shiftMonth(right, 1))}
          disabled={!canGoNext}
          aria-label="Later month"
          className="absolute top-0 right-0 flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
        <div className="grid gap-6 sm:grid-cols-2">
          {[shiftMonth(right, -1), right].map((ym, i) => (
            <Month
              key={ym}
              ym={ym}
              className={i === 0 ? "hidden sm:block" : ""}
              from={from}
              end={end}
              today={today}
              latest={latest}
              focused={focused}
              onPick={choose}
              onHover={setHover}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!to} onClick={() => to && onApply({ from, to })}>
          {to ? `Show ${formatRange(from, to)}` : "Pick the last day"}
        </Button>
      </div>
    </div>
  );
}

const minDate = (a: string, b: string) => (a < b ? a : b);

function Stub({ label, value, active, placeholder }: { label: string; value: string; active: boolean; placeholder?: boolean }) {
  return (
    <div className={`min-w-0 flex-1 px-3.5 py-3 transition-colors sm:px-4 ${active ? "bg-white/70" : ""}`}>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-brand-700 uppercase">{label}</p>
      <p className={`mt-0.5 text-[14px] leading-snug font-semibold sm:text-[15px] ${placeholder ? "text-brand-700/60" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Month({
  ym,
  className,
  from,
  end,
  today,
  latest,
  focused,
  onPick,
  onHover,
}: {
  ym: string;
  className: string;
  from: string;
  end: string | null;
  today: string;
  latest: string;
  focused: string;
  onPick: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const first = `${ym}-01`;
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  const length = dayCount(first, lastDayOf(ym));
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))];

  return (
    <div className={className}>
      <p className="flex h-9 items-center justify-center text-[15px] font-semibold text-ink">{monthTitle(ym)}</p>
      <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-semibold text-gray-400">
        {WEEKDAYS.map((w) => (
          <span key={w} aria-hidden className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;
          const isStart = date === from;
          const isEnd = date === end;
          const inside = end !== null && date > from && date < end;
          const off = date > latest;
          const band = end && end !== from ? (isStart ? "rounded-l-full bg-brand-100/70" : isEnd ? "rounded-r-full bg-brand-100/70" : inside ? "bg-brand-100/70" : "") : "";
          return (
            <div key={date} className={`flex justify-center ${band}`}>
              <button
                type="button"
                data-date={date}
                tabIndex={date === focused ? 0 : -1}
                disabled={off}
                aria-pressed={isStart || isEnd}
                aria-label={`${fullDay(date)}${date === today ? ", today" : ""}${isStart ? ", first day" : ""}${isEnd ? ", last day" : ""}`}
                onClick={() => onPick(date)}
                onMouseEnter={() => onHover(date)}
                className={`relative flex size-10 items-center justify-center rounded-full text-sm tabular-nums transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 ${
                  isStart || isEnd
                    ? "bg-brand-600 font-semibold text-white shadow-[0_6px_14px_-6px_rgba(210,70,0,0.7)]"
                    : off
                      ? "cursor-not-allowed text-gray-300"
                      : inside
                        ? "font-medium text-brand-700 hover:bg-brand-200/70"
                        : "text-ink hover:bg-canvas"
                }`}
              >
                {Number(date.slice(8))}
                {date === today && <span aria-hidden className={`absolute bottom-1 size-1 rounded-full ${isStart || isEnd ? "bg-white" : "bg-brand-500"}`} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
