import { Bell, CalendarDays, Heart, KeyRound, MapPin, ReceiptText, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NowCard, Tile } from "@/components/app/account-tiles";
import { InstallAppRow } from "@/components/app/install-app";
import { LogoutButton } from "@/components/app/logout-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileCard, Row, RowGroup } from "@/components/app/profile-parts";
import { requireRole } from "@/lib/auth";
import { formatClock, formatDay } from "@/lib/format";
import { isFinished } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { Address, ResidentBooking, ResidentOrder } from "@/lib/types";

export const metadata: Metadata = { title: "Account" };

export default function ResidentAccountPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <ResidentAccount />
    </Suspense>
  );
}

/**
 * Who you are, what's happening right now (an order on its way, the next booking), the places
 * you go most, then settings. The most used things sit at the top, settings below.
 */
async function ResidentAccount() {
  const user = await requireRole("RESIDENT");
  const [{ orders }, { bookings }, { total: savedCount }, { addresses }, { unread }] = await Promise.all([
    serverApi<{ orders: ResidentOrder[] }>("/orders"),
    serverApi<{ bookings: ResidentBooking[] }>("/bookings"),
    serverApi<{ total: number }>("/stores?favorites=1&limit=1"),
    serverApi<{ addresses: Address[] }>("/me/addresses"),
    serverApi<{ unread: number }>("/me/notifications?limit=1"),
  ]);
  const live = orders.filter((o) => !isFinished(o.status));
  const upcoming = bookings.filter((b) => b.upcoming).reverse();
  const toRate = orders.filter((o) => (o.status === "DELIVERED" || o.status === "COMPLETED") && !o.review).length;
  const home = addresses.find((a) => a.isDefault);

  return (
    <>
      <MobileHeading title="Account" />
      <div className="space-y-5">
        <ProfileCard
          user={user}
          stats={[
            { label: "Orders", value: orders.length, href: "/resident/orders" },
            { label: "Bookings", value: bookings.length, href: "/resident/bookings" },
            { label: "Saved", value: savedCount, href: "/resident/saved" },
          ]}
        />

        {(live.length > 0 || upcoming.length > 0) && (
          <div className="space-y-2">
            {live.length > 0 && (
              <NowCard
                href={live.length === 1 ? `/resident/orders/${live[0].id}` : "/resident/orders"}
                Icon={ReceiptText}
                title={live.length === 1 ? `Your order from ${live[0].vendor.name}` : `${live.length} orders in progress`}
                text="Track it live"
              />
            )}
            {upcoming.length > 0 && (
              <NowCard
                href="/resident/bookings"
                Icon={CalendarDays}
                title={`Table at ${upcoming[0].table.vendor.name}`}
                text={`${formatDay(upcoming[0].startsAt)}, ${formatClock(upcoming[0].startsAt)}`}
              />
            )}
          </div>
        )}

        <nav aria-label="Your Feasto" className="grid grid-cols-2 gap-3">
          <Tile href="/resident/orders" Icon={ReceiptText} label="Orders" note={toRate ? `${toRate} to rate` : "History and receipts"} />
          <Tile href="/resident/bookings" Icon={CalendarDays} label="Bookings" note={upcoming.length ? `${upcoming.length} coming up` : "Reserve a table"} />
          <Tile href="/resident/saved" Icon={Heart} label="Saved stores" note={savedCount ? `${savedCount} saved` : "Tap a heart to save"} />
          <Tile href="/resident/notifications" Icon={Bell} label="Notifications" note={unread ? `${unread} new` : "All caught up"} highlight={unread > 0} />
        </nav>

        <RowGroup title="Delivery">
          <Row Icon={MapPin} label={home ? `Deliver to ${home.label}` : "Add a delivery address"} value={home ? `${addresses.length} saved` : undefined} href="/resident/addresses" />
        </RowGroup>
        <InstallAppRow />
        <RowGroup title="Settings">
          <Row Icon={UserPen} label="Edit profile" value="Name and phone" href="/resident/profile" />
          <Row Icon={KeyRound} label="Change password" href="/resident/password" />
        </RowGroup>
        <LogoutButton variant="row" />
        <p className="pt-1 text-center text-xs text-gray-400">Feasto · Naval, Biliran</p>
      </div>
    </>
  );
}
