import { ArrowLeft, CalendarOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
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
      <Link href={`/resident/stores/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        {store.name}
      </Link>
      <MobileHeading title="Book a table" subtitle={`At ${store.name}. Tables are held for one hour.`} />
      {store.canBook ? (
        <BookingForm vendorId={store.id} maxPartySize={store.maxPartySize} />
      ) : (
        <EmptyState Icon={CalendarOff} title="Not taking bookings" text="This store doesn't take table bookings right now." />
      )}
    </>
  );
}
