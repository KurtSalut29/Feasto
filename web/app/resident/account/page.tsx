import { MapPin, UserPen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LogoutButton } from "@/components/app/logout-button";
import { MobileHeading, MobileSkeleton } from "@/components/app/mobile-shell";
import { ProfileCard, Row, RowGroup } from "@/components/app/profile-parts";
import { requireRole } from "@/lib/auth";

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
  return (
    <>
      <MobileHeading title="Account" />
      <div className="space-y-5">
        <ProfileCard user={user} />
        <RowGroup title="Settings">
          <Row Icon={MapPin} label="Delivery addresses" href="/resident/addresses" />
          <Row Icon={UserPen} label="Edit profile" href="/resident/profile" />
        </RowGroup>
        <LogoutButton variant="row" />
      </div>
    </>
  );
}
