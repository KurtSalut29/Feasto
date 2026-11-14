import { Suspense, type ReactNode } from "react";
import { HeaderStart } from "./header-start";
import { InstallBanner } from "./install-app";
import { LiveUpdates } from "./live-updates";
import { NotificationBell } from "./notification-bell";
import { ResidentTopNav } from "./resident-top-nav";
import { SidebarNav } from "./sidebar-nav";
import { SidebarUser } from "./dashboard-shell";
import { TabBar } from "./tab-bar";

/**
 * Layout for residents and riders.
 *
 * Phones (both roles): the app layout, with a top bar, the page, and bottom tabs.
 * Resident, from tablets up: a website, with the navigation across the top and wide pages.
 * Rider, from laptops up: a work dashboard, with a sidebar like the store's and wide pages
 * (tablets keep the app layout, a little wider).
 */
export function MobileShell({
  role,
  topBarEnd,
  sidebarContext,
  children,
}: {
  role: "RESIDENT" | "RIDER";
  /** Right side of the top bar, e.g. the cart button or the online switch */
  topBarEnd?: ReactNode;
  /** Rider, big screens: the card at the top of the sidebar */
  sidebarContext?: ReactNode;
  children: ReactNode;
}) {
  const resident = role === "RESIDENT";
  const allHref = `/${role.toLowerCase()}/notifications`;

  return (
    <LiveUpdates>
      <div className="min-h-dvh bg-canvas">
        {resident ? (
          <ResidentTopNav end={topBarEnd} />
        ) : (
          <SidebarNav
            role="RIDER"
            phone={false}
            badges={{}}
            context={sidebarContext}
            footer={
              <Suspense fallback={<div className="h-[52px] animate-pulse rounded-2xl bg-canvas" />}>
                <SidebarUser />
              </Suspense>
            }
          />
        )}

        <div
          className={`relative mx-auto flex min-h-dvh max-w-[440px] flex-col bg-white sm:border-x sm:border-line sm:shadow-[0_0_40px_rgba(16,24,40,0.06)] ${
            resident
              ? "md:min-h-0 md:max-w-6xl md:border-0 md:bg-transparent md:shadow-none"
              : "md:max-w-2xl lg:max-w-none lg:border-0 lg:bg-transparent lg:pl-[312px] lg:shadow-none lg:transition-[padding] lg:duration-300 lg:collapsed:pl-[132px]"
          }`}
        >
          {/* The app's top bar: phones (and tablets, for the rider) */}
          <header
            style={{ viewTransitionName: "app-header" }}
            className={`sticky top-0 z-20 box-content flex h-14 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur ${
              resident ? "md:hidden" : "lg:hidden"
            }`}
          >
            <HeaderStart role={role} />
            <div className="flex items-center gap-1">
              <NotificationBell allHref={allHref} />
              {topBarEnd}
            </div>
          </header>

          {/* Bottom padding keeps content clear of the tab bar when it shows (and the iPhone's home bar) */}
          <main
            className={`flex-1 px-4 pt-5 pb-[calc(var(--tabbar-h)+3rem+env(safe-area-inset-bottom))] ${
              resident ? "md:px-6 md:pt-7 md:pb-16" : "lg:mx-auto lg:w-full lg:max-w-6xl lg:px-10 lg:pt-6 lg:pb-12"
            }`}
          >
            {/* Rider, big screens: the bell and the online switch above every page */}
            {!resident && (
              <div className="relative z-20 mb-5 hidden h-11 items-center justify-end gap-2 lg:flex">
                {topBarEnd}
                <NotificationBell variant="floating" allHref={allHref} />
              </div>
            )}
            <InstallBanner />
            {children}
          </main>

          <TabBar role={role} />
        </div>
      </div>
    </LiveUpdates>
  );
}

/** Large page title used at the top of each mobile tab. */
export function MobileHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 md:mb-6">
      <h1 className="text-[22px] font-bold tracking-tight text-ink md:text-[28px]">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted md:text-[15px]">{subtitle}</p>}
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
