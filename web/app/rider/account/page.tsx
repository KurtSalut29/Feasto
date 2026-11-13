import { Bell, Bike, FileBadge, History, IdCard, KeyRound, Package, Store, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { NowCard, Tile } from "@/components/app/account-tiles";
import { InstallAppRow } from "@/components/app/install-app";
import { LogoutButton } from "@/components/app/logout-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileCard, Row, RowGroup } from "@/components/app/profile-parts";
import { ApprovalBadge } from "@/components/app/status-badges";
import { requireRole } from "@/lib/auth";
import { daysLeft, formatDate, formatPeso, isExpired } from "@/lib/format";
import { orderCode, riderEarns, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { JobsPage, RiderDelivery } from "@/lib/types";
import type { Totals } from "../rider-hero";

export const metadata: Metadata = { title: "Account" };

export default function RiderAccountPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderAccount />
    </Suspense>
  );
}

const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;

/** "Until Jun 30, 2028", or how soon it runs out once that's close */
function licenseNote(expires: string | null | undefined) {
  if (!expires) return "Send your license";
  if (isExpired(expires)) return "Expired. Send the renewed one";
  const left = daysLeft(expires);
  return left <= 30 ? `Expires in ${left} ${left === 1 ? "day" : "days"}` : `Until ${formatDate(expires)}`;
}

/**
 * Who the rider is, the delivery they're on, the places they go most (history, jobs,
 * notifications, license), then their motorcycle and settings.
 */
async function RiderAccount() {
  const user = await requireRole("RIDER");
  const profile = user.riderProfile;
  const approved = profile?.status === "APPROVED";
  const [{ totals, rating }, { order: active }, { unread }, jobs] = await Promise.all([
    serverApi<{ totals: Totals; rating: { average: number | null; count: number } }>("/rider/history"),
    serverApi<{ order: RiderDelivery | null }>("/rider/active"),
    serverApi<{ unread: number }>("/me/notifications?limit=1"),
    approved ? serverApi<JobsPage>("/rider/jobs?limit=1") : null,
  ]);
  const expires = profile?.licenseExpiresAt;
  const licenseUrgent = Boolean(expires && (isExpired(expires) || daysLeft(expires) <= 30));

  return (
    <>
      <MobileHeading title="Account" />
      <div className="space-y-5">
        <ProfileCard
          user={user}
          stats={[
            { label: "Today", value: peso(totals.today.earnings), href: "/rider/history" },
            { label: "Deliveries", value: totals.allTime.count, href: "/rider/history" },
            { label: "Rating", value: rating.average !== null ? `★ ${rating.average.toFixed(1)}` : "New", href: "/rider/ratings" },
            { label: "Earned", value: peso(totals.allTime.earnings), href: "/rider/history" },
          ]}
        />

        {active && (
          <NowCard
            href="/rider/active"
            Icon={Bike}
            title={`Delivering ${orderCode(active.id)} from ${active.vendor.name}`}
            text={`${statusLabel(active.status, "DELIVERY")} · +${formatPeso(riderEarns(active))}`}
          />
        )}

        <nav aria-label="Your Feasto" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Tile href="/rider/history" Icon={History} label="History" note={totals.today.count ? `${peso(totals.today.earnings)} today` : "Deliveries and pay"} />
          <Tile
            href={approved ? "/rider/jobs" : "/rider"}
            Icon={Package}
            label="Jobs"
            note={!jobs ? "After approval" : !jobs.online ? "Go online to get jobs" : jobs.total ? `${jobs.total} open now` : "None open right now"}
            highlight={Boolean(jobs?.online && jobs.total)}
          />
          <Tile href="/rider/notifications" Icon={Bell} label="Notifications" note={unread ? `${unread} new` : "All caught up"} highlight={unread > 0} />
          <Tile href="/rider/license" Icon={FileBadge} label="Driver's license" note={licenseNote(expires)} highlight={licenseUrgent} />
        </nav>

        {profile && (
          <RowGroup title="Rider details">
            <Row Icon={Bike} label={profile.vehicleModel ?? "Motorcycle"} value={profile.plateNumber ?? undefined} />
            <Row Icon={Store} label="Rides for" value={profile.vendor?.name ?? "Free rider"} />
            <Row Icon={IdCard} label="Approval status" value={<ApprovalBadge status={profile.status} />} />
          </RowGroup>
        )}
        <InstallAppRow />
        <RowGroup title="Settings">
          <Row Icon={UserPen} label="Edit profile" value="Name and phone" href="/rider/profile" />
          <Row Icon={KeyRound} label="Change password" href="/rider/password" />
        </RowGroup>
        <LogoutButton variant="row" />
        <p className="pt-1 text-center text-xs text-gray-400">Feasto for riders · Naval, Biliran</p>
      </div>
    </>
  );
}
