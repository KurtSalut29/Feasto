"use client";

import { CalendarDays, Clock, LoaderCircle, Minus, Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/api-client";
import { formatTime, manilaDate } from "@/lib/format";

type Slot = { time: string; available: boolean; tablesLeft: number };
const DAYS = 14;
/** Party sizes shown as one-tap chips; bigger groups use + and − */
const QUICK_SIZES = 8;

const onDay = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...options });

const PARTS = [
  { label: "Morning", test: (hour: number) => hour < 12 },
  { label: "Afternoon", test: (hour: number) => hour >= 12 && hour < 17 },
  { label: "Evening", test: (hour: number) => hour >= 17 },
];

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function BookingForm({ vendorId, storeName, maxPartySize }: { vendorId: string; storeName: string; maxPartySize: number }) {
  const router = useRouter();
  const dates = Array.from({ length: DAYS }, (_, i) => manilaDate(i));
  const [date, setDate] = useState(dates[0]);
  const [partySize, setPartySize] = useState(Math.min(2, maxPartySize));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string>();

  // Load free times whenever the day or party size changes
  useEffect(() => {
    let current = true;
    void apiRequest<{ slots: Slot[] }>(`/bookings/availability/${vendorId}?date=${date}&partySize=${partySize}`).then((result) => {
      if (!current) return;
      setSlots(result.ok ? result.data.slots : []);
    });
    return () => {
      current = false;
    };
  }, [vendorId, date, partySize]);

  function pick(change: () => void) {
    change();
    setSlots(null);
    setTime(null);
    setError(undefined);
  }

  async function book() {
    if (!time) return;
    setBooking(true);
    setError(undefined);
    const result = await apiRequest<{ booking: { id: string } }>("/bookings", { method: "POST", body: { vendorId, date, time, partySize, notes } });
    setBooking(false);
    if (!result.ok) {
      setError(result.error);
      // Someone may have just taken it; show the latest free times
      pick(() => undefined);
      return;
    }
    router.replace(`/resident/bookings?booked=${result.data.booking.id}`);
  }

  const free = slots?.filter((s) => s.available) ?? [];
  const sizes = Array.from({ length: Math.min(QUICK_SIZES, maxPartySize) }, (_, i) => i + 1);
  const dayName = date === dates[0] ? "Today" : date === dates[1] ? "Tomorrow" : onDay(date, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="space-y-7">
      <Step n={1} title="Day" Icon={CalendarDays}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <div className="flex w-max gap-2" role="group" aria-label="Day">
            {dates.map((d, i) => {
              const active = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pick(() => setDate(d))}
                  aria-pressed={active}
                  aria-label={`${i === 0 ? "Today, " : i === 1 ? "Tomorrow, " : ""}${onDay(d, { weekday: "long", month: "long", day: "numeric" })}`}
                  className={`flex h-[4.5rem] w-14 flex-col items-center justify-center rounded-2xl border transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    active ? "border-brand-600 bg-brand-600 text-white shadow-[0_8px_18px_-10px_rgba(178,58,0,0.8)]" : "border-line text-ink hover:border-gray-300"
                  }`}
                >
                  <span className={`text-[11px] font-semibold uppercase ${active ? "text-white/85" : "text-muted"}`}>
                    {i === 0 ? "Today" : onDay(d, { weekday: "short" })}
                  </span>
                  <span className="text-xl leading-tight font-bold">{onDay(d, { day: "numeric" })}</span>
                  <span className={`text-[11px] ${active ? "text-white/85" : "text-muted"}`}>{onDay(d, { month: "short" })}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Step>

      <Step n={2} title="People" Icon={Users} hint={`Up to ${maxPartySize} at ${storeName}`}>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Number of people">
          {sizes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => pick(() => setPartySize(n))}
              aria-pressed={partySize === n}
              aria-label={people(n)}
              className={`size-11 rounded-full border text-[15px] font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                partySize === n ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink hover:border-gray-300"
              }`}
            >
              {n}
            </button>
          ))}
          {maxPartySize > QUICK_SIZES && (
            <div className="flex items-center gap-1 rounded-full border border-line p-0.5">
              <button
                type="button"
                aria-label="Fewer people"
                disabled={partySize <= 1}
                onClick={() => pick(() => setPartySize((n) => n - 1))}
                className="flex size-9 items-center justify-center rounded-full hover:bg-canvas disabled:opacity-40"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className={`min-w-8 text-center font-semibold ${partySize > QUICK_SIZES ? "text-brand-700" : "text-ink"}`} aria-live="polite">
                {partySize}
              </span>
              <button
                type="button"
                aria-label="More people"
                disabled={partySize >= maxPartySize}
                onClick={() => pick(() => setPartySize((n) => n + 1))}
                className="flex size-9 items-center justify-center rounded-full hover:bg-canvas disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </Step>

      <Step n={3} title="Time" Icon={Clock} hint={slots && free.length > 0 ? `${free.length} free on ${dayName}` : undefined}>
        {slots === null ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking free tables…
          </p>
        ) : free.length === 0 ? (
          <Alert tone="pending">
            No free tables {dayName === "Today" ? "today" : `on ${dayName}`} for {people(partySize)}. Try another day{partySize > 1 ? " or a smaller party" : ""}.
          </Alert>
        ) : (
          <div className="space-y-4">
            {PARTS.map(({ label, test }) => {
              const part = slots.filter((s) => test(Number(s.time.slice(0, 2))));
              if (part.length === 0) return null;
              return (
                <div key={label} role="group" aria-label={label}>
                  <p className="mb-1.5 text-xs font-semibold tracking-wider text-gray-400 uppercase">{label}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {part.map((slot) => {
                      const chosen = time === slot.time;
                      const few = slot.available && slot.tablesLeft <= 2;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setTime(slot.time)}
                          aria-pressed={chosen}
                          aria-label={`${formatTime(slot.time)}${slot.available ? (few ? `, ${slot.tablesLeft} ${slot.tablesLeft === 1 ? "table" : "tables"} left` : "") : ", full"}`}
                          className={`flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 disabled:border-transparent disabled:bg-canvas disabled:text-gray-400 ${
                            chosen ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink hover:border-gray-300"
                          }`}
                        >
                          <span className={slot.available ? "" : "line-through"}>{formatTime(slot.time)}</span>
                          {!slot.available ? (
                            <span className="text-[10px] font-medium">Full</span>
                          ) : (
                            few && <span className={`text-[10px] font-medium ${chosen ? "text-white/85" : "text-amber-700"}`}>{slot.tablesLeft} left</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Step>

      <TextareaField
        label="Notes for the store (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="E.g. Birthday celebration, high chair needed, near the window."
        maxLength={200}
        rows={2}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {/* What's being booked, right above the button that books it */}
      <div className="sticky bottom-[calc(var(--tabbar-h)+1rem+env(safe-area-inset-bottom))] rounded-2xl border border-line bg-white/95 p-3 shadow-[0_12px_30px_-12px_rgba(31,45,61,0.35)] backdrop-blur">
        <p className="mb-2 flex flex-wrap items-center gap-x-2 text-sm text-muted" aria-live="polite">
          <span className="font-semibold text-ink">{dayName}</span>
          <span aria-hidden>·</span>
          <span className={time ? "font-semibold text-ink" : ""}>{time ? formatTime(time) : "Pick a time"}</span>
          <span aria-hidden>·</span>
          <span className="font-semibold text-ink">{people(partySize)}</span>
        </p>
        <Button className="w-full" disabled={!time} loading={booking} onClick={book}>
          {time ? "Book this table" : "Choose a time above"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, title, hint, Icon, children }: { n: number; title: string; hint?: string; Icon: typeof Clock; children: ReactNode }) {
  return (
    <section aria-labelledby={`book-step-${n}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-brand-50 text-brand-700" aria-hidden>
          <Icon className="size-4" />
        </span>
        <h2 id={`book-step-${n}`} className="font-semibold text-ink">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
        {hint && <p className="ml-auto text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
