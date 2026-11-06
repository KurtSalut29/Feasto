import { Bike, FileBadge, IdCard, KeyRound, Store, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { InstallAppRow } from "@/components/app/install-app";
import { LogoutButton } from "@/components/app/logout-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileCard, Row, RowGroup } from "@/components/app/profile-parts";
import { ApprovalBadge } from "@/components/app/status-badges";
import { requireRole } from "@/lib/auth";
import { formatDate, isExpired } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Account" };

export default function RiderAccountPage() {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <RiderAccount />
    </Suspense>
  );
}

async function RiderAccount() {
  const user = await requireRole("RIDER");
  const profile = user.riderProfile;
  const { totals } = await serverApi<{ totals: { today: { count: number; earnings: number }; allTime: { count: number; earnings: number } } }>(
    "/rider/history",
  );

  return (
    <>
      <MobileHeading title="Account" />
      <div className="space-y-5">
        <ProfileCard
          user={user}
          stats={[
            { label: "Today", value: `₱${Math.round(totals.today.earnings).toLocaleString("en-PH")}`, href: "/rider/history" },
            { label: "Deliveries", value: totals.allTime.count, href: "/rider/history" },
            { label: "Earned", value: `₱${Math.round(totals.allTime.earnings).toLocaleString("en-PH")}`, href: "/rider/history" },
          ]}
        />
        {profile && (
          <RowGroup title="Rider details">
            <Row Icon={Bike} label={profile.vehicleModel ?? "Motorcycle"} value={profile.plateNumber ?? undefined} />
            <Row Icon={Store} label="Rides for" value={profile.vendor?.name ?? "Free rider"} />
            <Row Icon={IdCard} label="Approval status" value={<ApprovalBadge status={profile.status} />} />
            {profile.licenseExpiresAt && (
              <Row
                Icon={FileBadge}
                label="Driver's license"
                href="/rider/license"
                value={isExpired(profile.licenseExpiresAt) ? <span className="font-semibold text-red-700">Expired</span> : `Until ${formatDate(profile.licenseExpiresAt)}`}
              />
            )}
          </RowGroup>
        )}
        <InstallAppRow />
        <RowGroup title="Settings">
          <Row Icon={UserPen} label="Edit profile" href="/rider/profile" />
          <Row Icon={KeyRound} label="Change password" href="/rider/password" />
        </RowGroup>
        <LogoutButton variant="row" />
      </div>
    </>
  );
}
