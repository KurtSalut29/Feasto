import { CalendarOff, Clock, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { StoreCover } from "@/components/app/store-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatHours, isOpenAllDay } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { StoreDetail } from "@/lib/types";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Book a table" };

export default function BookPage({ params }: PageProps<"/resident/stores/[id]/book">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Book params={params} />
    </Suspense>
  );
}

async function Book({ params }: Pick<PageProps<"/resident/stores/[id]/book">, "params">) {
  await requireRole("RESIDENT");
  const { id } = await params;
  const { store } = await serverApi<{ store: StoreDetail }>(`/stores/${id}`);

  return (
    <>
      <MobileHeading title="Book a table" subtitle="Pick a day, your party and a time. It takes a few seconds." />

      {/* Which store this is for, and what to know before booking */}
      <div className="mb-6 flex gap-3 rounded-2xl border border-line p-3">
        <StoreCover imageUrl={store.imageUrl} className="size-16 shrink-0 rounded-xl" eager />
        <div className="min-w-0 flex-1 space-y-0.5 text-[13px] text-muted">
          <p className="truncate text-[15px] font-semibold text-ink">{store.name}</p>
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{store.address}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            {isOpenAllDay(store) ? "Open 24 hours, every day" : `${formatHours(store)} daily`}
          </p>
          {store.canBook && (
            <p className="flex items-center gap-1.5">
              <Users className="size-3.5 shrink-0" aria-hidden />
              Tables for up to {store.maxPartySize} · held for one hour
            </p>
          )}
        </div>
      </div>

      {store.canBook ? (
        <BookingForm vendorId={store.id} storeName={store.name} maxPartySize={store.maxPartySize} />
      ) : (
        <EmptyState
          Icon={CalendarOff}
          title="Not taking bookings"
          text={`${store.name} doesn't take table bookings right now. You can still order for delivery or pickup.`}
          action={<ButtonLink href={`/resident/stores/${store.id}`}>See the menu</ButtonLink>}
        />
      )}
    </>
  );
}
