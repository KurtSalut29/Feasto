import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ROLE_HOME } from "@/lib/roles";
import { LiveUpdates } from "./live-updates";
import { NotificationBell } from "./notification-bell";
import { TabBar } from "./tab-bar";

/**
 * Phone layout for residents and riders: top bar, scrolling content, bottom tabs.
 * On a laptop it stays phone-width and centered, like the real mobile app.
 */
export function MobileShell({
  role,
  topBarEnd,
  children,
}: {
  role: "RESIDENT" | "RIDER";
  /** Right side of the top bar, e.g. the cart button or the online switch */
  topBarEnd?: ReactNode;
  children: ReactNode;
}) {
  return (
    <LiveUpdates>
      <div className="min-h-dvh bg-canvas">
        <div className="relative mx-auto flex min-h-dvh max-w-[440px] flex-col bg-white sm:border-x sm:border-line sm:shadow-[0_0_40px_rgba(16,24,40,0.06)]">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
            <Link href={ROLE_HOME[role]} className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
              {/* Sized by width so the browser's rounding never disagrees with Next.js */}
              <Image src="/Logo/feasto-logo.png" alt="Feasto" width={95} height={28} className="h-auto w-[95px]" priority />
            </Link>
            <div className="flex items-center gap-1">
              <NotificationBell />
              {topBarEnd}
            </div>
          </header>

          {/* Bottom padding keeps content clear of the tab bar */}
          <main className="flex-1 px-4 pt-5 pb-28">{children}</main>

          <TabBar role={role} />
        </div>
      </div>
    </LiveUpdates>
  );
}

/** Large page title used at the top of each mobile tab. */
export function MobileHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-[22px] font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

/** Placeholder while a mobile tab loads the signed-in user. */
export function MobileSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-gray-200" />
      <div className="h-4 w-56 animate-pulse rounded-lg bg-gray-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-gray-200" />
    </div>
  );
}
