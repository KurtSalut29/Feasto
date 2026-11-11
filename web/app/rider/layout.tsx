import { Bike } from "lucide-react";
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
      sidebarContext={
        <Suspense fallback={<div className="h-[60px] animate-pulse rounded-2xl bg-canvas" />}>
          <RiderCard />
        </Suspense>
      }
    >
      {/* Once per page (the online switch shows twice: in the phone bar and on big screens) */}
      <Suspense fallback={null}>
        <SharePosition />
      </Suspense>
      {children}
    </MobileShell>
  );
}

async function approvedOf() {
  const user = await requireRole("RIDER");
  const profile = user.riderProfile;
  // An expired license can't go online, so the switch isn't offered
  const approved = profile?.status === "APPROVED" && !(profile.licenseExpiresAt && isExpired(profile.licenseExpiresAt));
  return { user, profile, approved };
}

async function Availability() {
  const { profile, approved } = await approvedOf();
  return <AvailabilityToggle key={String(profile?.isOnline)} online={Boolean(approved && profile?.isOnline)} approved={approved} />;
}

async function SharePosition() {
  const { profile, approved } = await approvedOf();
  return approved && profile?.isOnline ? <PositionSender /> : null;
}

/** Big screens: who's riding, and on what, at the top of the sidebar */
async function RiderCard() {
  const { profile, approved } = await approvedOf();
  const online = Boolean(approved && profile?.isOnline);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line/80 bg-canvas/70 p-2.5 lg:collapsed:justify-center lg:collapsed:border-transparent lg:collapsed:bg-transparent lg:collapsed:p-0">
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Bike className="size-5" aria-hidden />
        <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white ${online ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 lg:collapsed:sr-only">
        <p className="truncate text-sm font-semibold text-ink">{profile?.vehicleModel ?? "Rider"}</p>
        <p className="truncate text-xs text-muted">
          {online ? "Online, taking jobs" : approved ? "Offline" : "Not approved yet"}
        </p>
      </div>
    </div>
  );
}
