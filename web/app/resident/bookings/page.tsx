import { CalendarDays, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCover } from "@/components/app/store-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDay } from "@/lib/format";
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

export default function ResidentBookingsPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentBookings />
    </Suspense>
  );
}

function BookingCard({ booking, upcoming }: { booking: ResidentBooking; upcoming: boolean }) {
  const store = booking.table.vendor;
  return (
    <li className="rounded-2xl border border-line p-3">
      <div className="flex gap-3">
        <StoreCover imageUrl={store.imageUrl} className="size-14 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/resident/stores/${store.id}`} className="truncate font-semibold text-ink hover:underline">
              {store.name}
            </Link>
            <Badge tone={STATUS[booking.status].tone}>{STATUS[booking.status].label}</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink">
            <CalendarDays className="size-4 text-muted" aria-hidden />
            {formatDay(booking.startsAt)}, {formatClock(booking.startsAt)}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Users className="size-4" aria-hidden />
            {booking.partySize} {booking.partySize === 1 ? "person" : "people"} · {booking.table.label}
          </p>
          {upcoming && (
            <p className="flex items-start gap-1.5 text-sm text-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {store.address}
            </p>
          )}
        </div>
      </div>
      {upcoming && booking.status === "CONFIRMED" && (
        <div className="mt-3">
          <CancelBookingButton bookingId={booking.id} />
        </div>
      )}
    </li>
  );
}

async function ResidentBookings() {
  await requireRole("RESIDENT");
  const { bookings } = await serverApi<{ bookings: ResidentBooking[] }>("/bookings");
  const upcoming = bookings.filter((b) => b.upcoming).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <>
      <MobileHeading title="Bookings" subtitle="Your table reservations." />
      {bookings.length === 0 ? (
        <EmptyState
          Icon={CalendarDays}
          title="No bookings yet"
          text="Reserve a table at stores that accept bookings."
          action={<ButtonLink href="/resident?reservations=1">Find a place to book</ButtonLink>}
        />
      ) : (
        <>
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing coming up.{" "}
                <Link href="/resident?reservations=1" className="font-semibold text-brand-700 hover:underline">
                  Book a table
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((b) => (
                  <BookingCard key={b.id} booking={b} upcoming />
                ))}
              </ul>
            )}
          </section>
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-400">Past and cancelled</h2>
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
