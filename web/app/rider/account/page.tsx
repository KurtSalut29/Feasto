import { Bike, IdCard, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/app/logout-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileCard, Row, RowGroup } from "@/components/app/profile-parts";
import { ApprovalBadge } from "@/components/app/status-badges";
import { requireRole } from "@/lib/auth";
import { serverApi } from "@/lib/server-api";
import { VEHICLE_LABEL } from "@/lib/labels";

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
          <RowGroup title="Vehicle">
            <Row Icon={Bike} label={VEHICLE_LABEL[profile.vehicleType]} value={profile.plateNumber ?? undefined} />
            <Row Icon={IdCard} label="Approval status" value={<ApprovalBadge status={profile.status} />} />
          </RowGroup>
        )}
        <RowGroup title="Settings">
          <Row Icon={UserPen} label="Edit profile" href="/rider/profile" />
        </RowGroup>
        <LogoutButton variant="row" />
      </div>
    </>
  );
}
