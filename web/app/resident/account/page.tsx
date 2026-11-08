import { Bell, CalendarDays, ChevronRight, Heart, KeyRound, MapPin, ReceiptText, UserPen, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
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

function NowCard({ href, Icon, title, text }: { href: string; Icon: LucideIcon; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs font-medium text-brand-700">{text}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-brand-700" aria-hidden />
    </Link>
  );
}

function Tile({ href, Icon, label, note, highlight }: { href: string; Icon: LucideIcon; label: string; note: string; highlight?: boolean }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-line p-3.5 transition hover:border-gray-300 hover:bg-canvas/60 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <span className="relative flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden />
        {highlight && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand-600 ring-2 ring-white" />}
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        <span className={`block text-xs ${highlight ? "font-semibold text-brand-700" : "text-muted"}`}>{note}</span>
      </span>
    </Link>
  );
}
