import { CalendarDays, CalendarPlus, CircleCheck, Clock, MapPin, Navigation, NotebookPen, RotateCcw, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCover } from "@/components/app/store-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDay, manilaDate } from "@/lib/format";
import { orderCode } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { BookingStatus, ResidentBooking } from "@/lib/types";
import { CancelBookingButton } from "./cancel-booking-button";

export const metadata: Metadata = { title: "Bookings" };

const STATUS: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  COMPLETED: { label: "Completed", tone: "neutral" },
  NO_SHOW: { label: "Missed", tone: "danger" },
};

export default function ResidentBookingsPage({ searchParams }: PageProps<"/resident/bookings">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentBookings searchParams={searchParams} />
    </Suspense>
  );
}

const manila = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", ...options });
const manilaDay = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10);
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** "Today, in 3 hours", "Tomorrow", "In 5 days" */
function countdown(iso: string) {
  const days = Math.round((Date.parse(manilaDay(iso)) - Date.parse(manilaDate())) / 86400_000);
  if (days <= 0) {
    const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
    if (minutes < 60) return `Today, in ${minutes} min`;
    const hours = Math.round(minutes / 60);
    return `Today, in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** A calendar file (.ics) phones and laptops open in their calendar app. */
function calendarHref(booking: ResidentBooking) {
  const store = booking.table.vendor;
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const text = (value: string) => value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const start = new Date(booking.startsAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Feasto//Table bookings//EN",
    "BEGIN:VEVENT",
    `UID:${booking.id}@feasto`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(new Date(start.getTime() + 3600_000))}`,
    `SUMMARY:${text(`Table at ${store.name}`)}`,
    `LOCATION:${text(store.address)}`,
    `DESCRIPTION:${text(`${people(booking.partySize)} · ${booking.table.label} · Booking ${orderCode(booking.id)}. Booked on Feasto. The table is held for one hour.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

const directionsHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const chip =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-3 text-[13px] font-semibold text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500";

/** The next reservation, as a ticket: the store, the moment, the party, and what to do before going. */
function NextBooking({ booking, justBooked }: { booking: ResidentBooking; justBooked: boolean }) {
  const store = booking.table.vendor;
  return (
    <article
      aria-label={`Next booking at ${store.name}`}
      className={`overflow-hidden rounded-3xl border bg-white shadow-[0_16px_32px_-22px_rgba(31,45,61,0.45)] ${justBooked ? "border-emerald-300 ring-2 ring-emerald-200" : "border-line"}`}
    >
      <div className="relative">
        {store.imageUrl ? (
          <>
            <StoreCover imageUrl={store.imageUrl} className="h-28 w-full" eager />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </>
        ) : (
          // No photo: Feasto orange, so the ticket still looks finished
          <div aria-hidden className="h-28 w-full bg-gradient-to-br from-brand-500 to-brand-700">
            <CalendarDays className="absolute top-3 right-4 size-16 text-white/15" />
          </div>
        )}
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-white/80 uppercase">{countdown(booking.startsAt)}</p>
            <Link href={`/resident/stores/${store.id}`} className="block truncate text-lg font-bold hover:underline">
              {store.name}
            </Link>
          </div>
          <Badge tone="success" dot>
            Confirmed
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
        <Fact label="Date" value={manila(booking.startsAt, { weekday: "short", month: "short", day: "numeric" })} />
        <Fact label="Time" value={formatClock(booking.startsAt)} />
        <Fact label="Party" value={people(booking.partySize)} />
      </div>

      {/* Perforation: the notches and dashes of a tear-off ticket */}
      <div aria-hidden className="relative h-0">
        <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full border border-line bg-canvas" />
        <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full border border-line bg-canvas" />
      </div>

      <div className="space-y-2.5 p-4 text-sm">
        <p className="flex items-start gap-2 text-ink">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          {store.address}
        </p>
        <p className="flex items-center gap-2 text-ink">
          <Users className="size-4 shrink-0 text-muted" aria-hidden />
          {booking.table.label} · held for one hour from {formatClock(booking.startsAt)}
        </p>
        {booking.notes && (
          <p className="flex items-start gap-2 text-muted">
            <NotebookPen className="mt-0.5 size-4 shrink-0" aria-hidden />“{booking.notes}”
          </p>
        )}
        <p className="text-xs text-muted">
          Booking <span className="font-semibold tracking-wider text-ink">{orderCode(booking.id)}</span>. Show this at the store if they ask.
        </p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <a href={calendarHref(booking)} download={`feasto-booking-${orderCode(booking.id).slice(1)}.ics`} className={chip}>
            <CalendarPlus className="size-4 text-brand-600" aria-hidden />
            Add to calendar
          </a>
          <a href={directionsHref(store.address)} target="_blank" rel="noreferrer" className={chip}>
            <Navigation className="size-4 text-brand-600" aria-hidden />
            Directions
          </a>
        </div>
        <div className="flex justify-center">
          <CancelBookingButton bookingId={booking.id} storeName={store.name} when={`${formatDay(booking.startsAt)}, ${formatClock(booking.startsAt)}`} />
        </div>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <p className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">{label}</p>
      <p className="mt-0.5 text-[15px] font-bold text-ink">{value}</p>
    </div>
  );
}

/** Any other reservation, as a small ticket: the date on the left, the details on the right. */
function BookingCard({ booking, upcoming }: { booking: ResidentBooking; upcoming: boolean }) {
  const store = booking.table.vendor;
  return (
    <li className={`flex overflow-hidden rounded-2xl border ${upcoming ? "border-line bg-white" : "border-line/70 bg-canvas/60"}`}>
      <div
        className={`flex w-[68px] shrink-0 flex-col items-center justify-center border-r border-dashed ${
          upcoming ? "border-brand-100 bg-brand-50 text-brand-700" : "border-line text-muted"
        }`}
      >
        <span className="text-xs font-semibold tracking-wider uppercase">{manila(booking.startsAt, { month: "short" })}</span>
        <span className="text-2xl leading-none font-bold">{manila(booking.startsAt, { day: "numeric" })}</span>
        <span className="mt-0.5 text-[11px]">{manila(booking.startsAt, { weekday: "short" })}</span>
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/resident/stores/${store.id}`} className="truncate font-semibold text-ink hover:underline">
            {store.name}
          </Link>
          <Badge tone={STATUS[booking.status].tone}>{STATUS[booking.status].label}</Badge>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink">
          <Clock className="size-4 text-muted" aria-hidden />
          {upcoming ? `${countdown(booking.startsAt)} · ` : ""}
          {formatClock(booking.startsAt)}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Users className="size-4" aria-hidden />
          {people(booking.partySize)} · {booking.table.label}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {upcoming ? (
            <>
              <a href={calendarHref(booking)} download={`feasto-booking-${orderCode(booking.id).slice(1)}.ics`} className="text-[13px] font-semibold text-brand-700 hover:underline">
                Add to calendar
              </a>
              <span className="ml-auto">
                <CancelBookingButton bookingId={booking.id} storeName={store.name} when={`${formatDay(booking.startsAt)}, ${formatClock(booking.startsAt)}`} />
              </span>
            </>
          ) : (
            <Link
              href={`/resident/stores/${store.id}/book`}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Book again
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

async function ResidentBookings({ searchParams }: Pick<PageProps<"/resident/bookings">, "searchParams">) {
  await requireRole("RESIDENT");
  const { booked } = await searchParams;
  const { bookings } = await serverApi<{ bookings: ResidentBooking[] }>("/bookings");
  const upcoming = bookings.filter((b) => b.upcoming).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));
  const [next, ...later] = upcoming;
  const justBooked = typeof booked === "string" ? bookings.find((b) => b.id === booked && b.upcoming) : undefined;

  return (
    <>
      <MobileHeading
        title="Bookings"
        subtitle={upcoming.length ? `${upcoming.length} coming up. Tables are held for one hour.` : "Your table reservations."}
      />
      {justBooked && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <p className="text-sm">
            <span className="font-semibold">Table booked at {justBooked.table.vendor.name}.</span> {formatDay(justBooked.startsAt)}, {formatClock(justBooked.startsAt)} for{" "}
            {people(justBooked.partySize)}. The store has been told.
          </p>
        </div>
      )}
      {bookings.length === 0 ? (
        <EmptyState
          Icon={CalendarDays}
          title="No bookings yet"
          text="Reserve a table at stores that take bookings. You'll see the day, time and table here."
          action={<ButtonLink href="/resident/stores?reservations=1">Find a place to book</ButtonLink>}
        />
      ) : (
        <>
          <section className="mb-7" aria-labelledby="bookings-next">
            <h2 id="bookings-next" className="mb-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">
              {next ? "Next up" : "Upcoming"}
            </h2>
            {next ? (
              <NextBooking booking={next} justBooked={justBooked?.id === next.id} />
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-4">
                <p className="text-sm text-muted">Nothing coming up.</p>
                <ButtonLink href="/resident/stores?reservations=1" variant="secondary" className="h-9 px-3 text-sm">
                  Book a table
                </ButtonLink>
              </div>
            )}
          </section>
          {later.length > 0 && (
            <section className="mb-7" aria-labelledby="bookings-later">
              <h2 id="bookings-later" className="mb-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">
                Later
              </h2>
              <ul className="space-y-2">
                {later.map((b) => (
                  <BookingCard key={b.id} booking={b} upcoming />
                ))}
              </ul>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="bookings-past">
              <h2 id="bookings-past" className="mb-2 text-sm font-semibold tracking-wider text-gray-400 uppercase">
                Past and cancelled
              </h2>
              <ul className="space-y-2">
                {past.map((b) => (
                  <BookingCard key={b.id} booking={b} upcoming={false} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
