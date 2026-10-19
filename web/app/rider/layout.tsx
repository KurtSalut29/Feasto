import { Suspense, type ReactNode } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { requireRole } from "@/lib/auth";
import { AvailabilityToggle } from "./availability-toggle";

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
  const approved = profile?.status === "APPROVED";
  return <AvailabilityToggle key={String(profile?.isOnline)} online={approved && Boolean(profile?.isOnline)} approved={approved} />;
}
