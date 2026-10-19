"use client";

import { LoaderCircle, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { apiRequest } from "@/lib/api-client";
import { formatTime, manilaDate } from "@/lib/format";

type Slot = { time: string; available: boolean; tablesLeft: number };
const DAYS = 14;

function dayLabel(date: string, index: number) {
  if (index === 0) return { top: "Today", bottom: "" };
  if (index === 1) return { top: "Tomorrow", bottom: "" };
  const d = new Date(`${date}T00:00:00+08:00`);
  return {
    top: d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short" }),
    bottom: d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }),
  };
}

export function BookingForm({ vendorId, maxPartySize }: { vendorId: string; maxPartySize: number }) {
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
    const result = await apiRequest("/bookings", { method: "POST", body: { vendorId, date, time, partySize, notes } });
    setBooking(false);
    if (!result.ok) {
      setError(result.error);
      // Someone may have just taken it; show the latest free times
      pick(() => undefined);
      return;
    }
    router.replace("/resident/bookings");
  }

  const free = slots?.filter((s) => s.available) ?? [];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold text-ink">Day</h2>
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
          <div className="flex w-max gap-2">
            {dates.map((d, i) => {
              const label = dayLabel(d, i);
              const active = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pick(() => setDate(d))}
                  aria-pressed={active}
                  className={`flex h-14 min-w-16 flex-col items-center justify-center rounded-xl border px-3 text-sm transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    active ? "border-brand-500 bg-brand-50 font-semibold text-brand-700 ring-1 ring-brand-500" : "border-line text-ink hover:border-gray-300"
                  }`}
                >
                  <span>{label.top}</span>
                  {label.bottom && <span className="text-xs text-muted">{label.bottom}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-ink">People</h2>
          <p className="text-sm text-muted">Up to {maxPartySize} at this store</p>
        </div>
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
          <span className="min-w-8 text-center font-semibold text-ink" aria-live="polite">
            {partySize}
          </span>
          <button
            type="button"
            aria-label="More people"
            disabled={partySize >= maxPartySize}
            onClick={() => pick(() => setPartySize((n) => n + 1))}
            className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold text-ink">Time</h2>
        {slots === null ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Checking free tables…
          </p>
        ) : free.length === 0 ? (
          <Alert tone="pending">No free tables that day for {partySize}. Try another day.</Alert>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <button
                key={slot.time}
                type="button"
                disabled={!slot.available}
                onClick={() => setTime(slot.time)}
                aria-pressed={time === slot.time}
                className={`h-11 rounded-xl border text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500 disabled:border-transparent disabled:bg-canvas disabled:text-gray-400 disabled:line-through ${
                  time === slot.time ? "border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "border-line text-ink hover:border-gray-300"
                }`}
              >
                {formatTime(slot.time)}
              </button>
            ))}
          </div>
        )}
      </section>

      <TextareaField
        label="Notes for the store"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional, e.g. Birthday celebration, high chair needed."
        maxLength={200}
        rows={2}
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="sticky bottom-20">
        <Button className="w-full shadow-lg" disabled={!time} loading={booking} onClick={book}>
          {time ? `Book for ${partySize} at ${formatTime(time)}` : "Choose a time"}
        </Button>
      </div>
    </div>
  );
}
