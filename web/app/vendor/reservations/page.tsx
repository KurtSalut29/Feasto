import { CalendarDays, CalendarOff, MessageSquareText, Phone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/app/avatar";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDay, manilaDate } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { BookingStatus, DiningTable, VendorBooking } from "@/lib/types";
import { BookingActions } from "./booking-actions";
import { TablesManager } from "./tables-manager";

export const metadata: Metadata = { title: "Reservations" };

const STATUS: Record<BookingStatus, { label: string; tone: BadgeTone }> = {
  CONFIRMED: { label: "Confirmed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  COMPLETED: { label: "Arrived", tone: "info" },
  NO_SHOW: { label: "No-show", tone: "danger" },
};

export default function VendorReservationsPage({ searchParams }: PageProps<"/vendor/reservations">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorReservations searchParams={searchParams} />
    </Suspense>
  );
}

const noon = (date: string) => `${date}T12:00:00+08:00`;

async function VendorReservations({ searchParams }: Pick<PageProps<"/vendor/reservations">, "searchParams">) {
  const user = await requireRole("VENDOR");
  if (!user.vendor!.acceptsReservations) {
    return (
      <>
        <PageHeader title="Reservations" description="Your tables and the bookings residents make." />
        <Card>
          <EmptyState
            Icon={CalendarOff}
            title="Table reservations are off"
            text="Your store doesn't take bookings right now. Turn reservations on in your store settings."
            action={
              <ButtonLink href="/vendor/store" variant="secondary">
                Go to store settings
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  const params = await searchParams;
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : manilaDate();
  const [{ tables }, { bookings, week }] = await Promise.all([
    serverApi<{ tables: DiningTable[] }>("/vendor/tables"),
    serverApi<{ bookings: VendorBooking[]; week: Record<string, number> }>(`/vendor/bookings?date=${date}`),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => manilaDate(i));
  const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
  const guests = confirmed.reduce((n, b) => n + b.partySize, 0);
  const arrived = bookings.filter((b) => b.status === "COMPLETED").length;
  // Which times each table is taken on this day, for the floor plan
  const bookedTimes: Record<string, string[]> = {};
  for (const b of confirmed) (bookedTimes[b.table.label] ??= []).push(formatClock(b.startsAt));

  return (
    <>
      <PageHeader title="Reservations" description="Your tables and the bookings residents make." />

      {/* The next 7 days, with how many bookings each has */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <nav aria-label="Day" className="grid min-w-0 flex-1 grid-cols-4 gap-2 sm:grid-cols-7">
          {days.map((d, i) => {
            const active = d === date;
            const count = week[d] ?? 0;
            const weekday = new Date(noon(d)).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short" });
            const dayNumber = Number(d.slice(8));
            return (
              <Link
                key={d}
                href={`/vendor/reservations?date=${d}`}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center rounded-2xl border px-2 py-2.5 transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                  active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-gray-300"
                }`}
              >
                <span className={`text-xs font-medium ${active ? "text-white/70" : "text-muted"}`}>{i === 0 ? "Today" : weekday}</span>
                <span className="text-xl font-semibold tabular-nums">{dayNumber}</span>
                <span
                  className={`mt-0.5 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap ${
                    count ? (active ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700") : active ? "text-white/60" : "text-gray-400"
                  }`}
                >
                  {count ? (
                    <>
                      {count}
                      <span className="max-sm:sr-only"> booked</span>
                    </>
                  ) : (
                    "Free"
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
        <form action="/vendor/reservations" className="flex flex-col justify-center gap-1.5 rounded-2xl border border-line bg-white px-3 py-2.5">
          <label htmlFor="pick-date" className="text-xs font-medium text-muted">
            Another day
          </label>
          <div className="flex gap-2">
            <input id="pick-date" type="date" name="date" defaultValue={date} className="h-9 rounded-lg border border-line px-2 text-sm" />
            <button type="submit" className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-white hover:bg-ink/90">
              Show
            </button>
          </div>
        </form>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card
          title={formatDay(noon(date))}
          description={
            confirmed.length
              ? `${confirmed.length} confirmed ${confirmed.length === 1 ? "booking" : "bookings"} · ${guests} ${guests === 1 ? "guest" : "guests"}${arrived ? ` · ${arrived} arrived` : ""}`
              : "No confirmed bookings"
          }
          Icon={CalendarDays}
        >
          {bookings.length === 0 ? (
            <EmptyState Icon={CalendarDays} title="No bookings this day" text="New bookings appear here, and you get a notification." />
          ) : (
            <ol className="px-3 py-3 sm:px-5">
              {bookings.map((b, i) => (
                <li key={b.id} className="grid grid-cols-[56px_14px_minmax(0,1fr)] gap-2 sm:grid-cols-[64px_14px_minmax(0,1fr)] sm:gap-3">
                  <p className="pt-4 text-right text-sm font-semibold whitespace-nowrap text-ink tabular-nums">{formatClock(b.startsAt)}</p>
                  {/* Timeline: a dot per booking joined by a line */}
                  <div aria-hidden className="relative flex justify-center">
                    <span className={`relative z-10 mt-[22px] size-2.5 rounded-full ring-4 ring-white ${b.status === "CONFIRMED" ? "bg-brand-500" : "bg-gray-300"}`} />
                    {bookings.length > 1 && (
                      <span className={`absolute w-px bg-line ${i === 0 ? "top-6" : "top-0"} ${i === bookings.length - 1 ? "h-6" : "bottom-0"}`} />
                    )}
                  </div>
                  <div className="my-1.5 flex flex-col gap-3 rounded-2xl border border-line bg-white p-3.5 sm:flex-row sm:items-start">
                    <span className="hidden sm:block">
                      <Avatar name={b.resident.name} muted={b.status === "CANCELLED"} />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{b.resident.name}</p>
                        <Badge tone={STATUS[b.status].tone} dot>
                          {STATUS[b.status].label}
                        </Badge>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" aria-hidden />
                          {b.partySize} {b.partySize === 1 ? "person" : "people"}
                        </span>
                        <span>
                          {b.table.label} · {b.table.seats} seats
                        </span>
                        {b.resident.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3.5" aria-hidden /> {b.resident.phone}
                          </span>
                        )}
                      </p>
                      {b.notes && (
                        <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
                          <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {b.notes}
                        </p>
                      )}
                    </div>
                    {b.status === "CONFIRMED" && <BookingActions bookingId={b.id} started={b.started} />}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <TablesManager tables={tables} bookedTimes={bookedTimes} dayLabel={date === manilaDate() ? "today" : `on ${formatDay(noon(date))}`} />
      </div>
    </>
  );
}
