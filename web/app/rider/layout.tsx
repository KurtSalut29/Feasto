import { Suspense, type ReactNode } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { isExpired } from "@/lib/format";
import { AvailabilityToggle } from "./availability-toggle";
import { PositionSender } from "./position-sender";

export default function RiderLayout({ children }: { children: ReactNode }) {
  return (
    <MobileShell
      role="RIDER"
      topBarEnd={
        <Suspense fallback={<span className="h-8 w-24 animate-pulse rounded-full bg-gray-100" />}>
          <Availability />
        </Suspense>
      }
    >
      {children}
    </MobileShell>
  );
}

async function Availability() {
  const user = await requireRole("RIDER");
  const profile = user.riderProfile;
  // An expired license can't go online, so the switch isn't offered
  const approved = profile?.status === "APPROVED" && !(profile.licenseExpiresAt && isExpired(profile.licenseExpiresAt));
  return (
    <>
      <AvailabilityToggle key={String(profile?.isOnline)} online={Boolean(approved && profile?.isOnline)} approved={approved} />
      {approved && profile?.isOnline && <PositionSender />}
    </>
  );
}
