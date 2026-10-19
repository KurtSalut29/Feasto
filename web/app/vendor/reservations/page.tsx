import { CalendarDays, CalendarOff, MessageSquareText, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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
  COMPLETED: { label: "Arrived", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "danger" },
};

export default function VendorReservationsPage({ searchParams }: PageProps<"/vendor/reservations">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <VendorReservations searchParams={searchParams} />
    </Suspense>
  );
}

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
  const [{ tables }, { bookings }] = await Promise.all([
    serverApi<{ tables: DiningTable[] }>("/vendor/tables"),
    serverApi<{ bookings: VendorBooking[] }>(`/vendor/bookings?date=${date}`),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => manilaDate(i));
  const active = bookings.filter((b) => b.status === "CONFIRMED").length;

  return (
    <>
      <PageHeader title="Reservations" description="Your tables and the bookings residents make." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          title={`Bookings · ${formatDay(`${date}T12:00:00+08:00`)}`}
          description={`${active} confirmed`}
          actions={
            <form action="/vendor/reservations">
              <input
                type="date"
                name="date"
                defaultValue={date}
                aria-label="Show bookings for"
                className="h-9 rounded-lg border border-line px-2 text-sm"
              />
              <button type="submit" className="ml-2 h-9 rounded-lg border border-line px-3 text-sm font-medium hover:bg-canvas">
                Show
              </button>
            </form>
          }
        >
          <div className="flex gap-2 overflow-x-auto border-b border-line px-5 py-3">
            {days.map((d, i) => (
              <Link
                key={d}
                href={`/vendor/reservations?date=${d}`}
                aria-current={d === date ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${
                  d === date ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-gray-300"
                }`}
              >
                {i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatDay(`${d}T12:00:00+08:00`)}
              </Link>
            ))}
          </div>
          {bookings.length === 0 ? (
            <EmptyState Icon={CalendarDays} title="No bookings this day" text="New bookings appear here, and you get a notification." />
          ) : (
            <ul className="divide-y divide-line">
              {bookings.map((b) => (
                <li key={b.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[90px_minmax(0,1fr)_auto] sm:items-center">
                  <p className="text-lg font-bold text-ink">{formatClock(b.startsAt)}</p>
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{b.resident.name}</p>
                      <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>
                    </div>
                    <p className="text-muted">
                      {b.partySize} {b.partySize === 1 ? "person" : "people"} · {b.table.label} ({b.table.seats} seats)
                    </p>
                    {b.resident.phone && (
                      <p className="flex items-center gap-1.5 text-muted">
                        <Phone className="size-3.5" aria-hidden /> {b.resident.phone}
                      </p>
                    )}
                    {b.notes && (
                      <p className="mt-1 flex gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">
                        <MessageSquareText className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {b.notes}
                      </p>
                    )}
                  </div>
                  {b.status === "CONFIRMED" && <BookingActions bookingId={b.id} started={b.started} />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <TablesManager tables={tables} />
      </div>
    </>
  );
}
