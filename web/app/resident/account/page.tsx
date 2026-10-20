import { CalendarDays, Heart, MapPin, ReceiptText, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/app/logout-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileCard, Row, RowGroup } from "@/components/app/profile-parts";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import type { ResidentBooking, ResidentOrder, StoreSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Account" };

export default function ResidentAccountPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentAccount />
    </Suspense>
  );
}

async function ResidentAccount() {
  const user = await requireRole("RESIDENT");
  const [{ orders }, { bookings }, { stores: saved }] = await Promise.all([
    serverApi<{ orders: ResidentOrder[] }>("/orders"),
    serverApi<{ bookings: ResidentBooking[] }>("/bookings"),
    serverApi<{ stores: StoreSummary[] }>("/stores?favorites=1"),
  ]);
  return (
    <>
      <MobileHeading title="Account" />
      <div className="space-y-5">
        <ProfileCard
          user={user}
          stats={[
            { label: "Orders", value: orders.length, href: "/resident/orders" },
            { label: "Bookings", value: bookings.length, href: "/resident/bookings" },
            { label: "Saved", value: saved.length, href: "/resident?favorites=1" },
          ]}
        />
        <RowGroup title="Shortcuts">
          <Row Icon={Heart} label="Saved stores" value={saved.length || undefined} href="/resident?favorites=1" />
          <Row Icon={ReceiptText} label="Order history" href="/resident/orders" />
          <Row Icon={CalendarDays} label="Table bookings" href="/resident/bookings" />
        </RowGroup>
        <RowGroup title="Settings">
          <Row Icon={MapPin} label="Delivery addresses" href="/resident/addresses" />
          <Row Icon={UserPen} label="Edit profile" href="/resident/profile" />
        </RowGroup>
        <LogoutButton variant="row" />
      </div>
    </>
  );
}
