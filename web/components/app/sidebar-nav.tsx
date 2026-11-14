"use client";

import { ChevronLeft, Ellipsis, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PageBack } from "./page-back";
import { tabTypes } from "./page-transition";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { activeHref, DASHBOARD_TABS, NAVIGATION, type NavItem } from "@/lib/navigation";
import { ROLE_HOME } from "@/lib/roles";
import { SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";
import type { Role } from "@/lib/types";
import { NotificationBell } from "./notification-bell";
import { RailTooltip } from "./rail-tooltip";

/** The roles with a sidebar on big screens (the rider gets one too, from laptops up) */
type DashboardRole = Extract<Role, "VENDOR" | "ADMIN" | "RIDER">;

/** Extra content for a link, keyed by its href (e.g. a count of new orders). */
export type NavBadges = Partial<Record<string, ReactNode>>;

// ---------- Folded or open (shared by every component that asks) ----------

const listeners = new Set<() => void>();
const isCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setCollapsed(collapsed: boolean) {
  if (collapsed) document.documentElement.dataset.sidebar = "collapsed";
  else delete document.documentElement.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "open");
  } catch {
    // Private windows can block storage; the sidebar still folds for this visit
  }
  listeners.forEach((listener) => listener());
}

function CollapseToggle() {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <button
      type="button"
      onClick={() => setCollapsed(!collapsed)}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className="absolute top-7 -right-3.5 z-10 flex size-7 items-center justify-center rounded-full border border-line bg-white text-muted shadow-sm transition hover:border-brand-100 hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <ChevronLeft className="size-4 transition-transform duration-300 lg:collapsed:rotate-180" aria-hidden />
    </button>
  );
}

// ---------- Pieces ----------

function Brand({ role }: { role: DashboardRole }) {
  return (
    <Link
      href={ROLE_HOME[role]}
      aria-label="Feasto home"
      className="flex shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <Image src="/Logo/feasto-logo.png" alt="" width={108} height={32} className="h-8 w-[108px] shrink-0 object-contain lg:collapsed:hidden" priority />
      <Image src="/Logo/feasto-mascot.png" alt="" width={40} height={40} className="hidden size-10 lg:collapsed:block" />
    </Link>
  );
}

/** Reads the URL inside <Suspense> so pages with an id in the URL can still prerender. */
function NavLinks(props: { role: DashboardRole; badges: NavBadges; onNavigate?: () => void; only?: (item: NavItem) => boolean }) {
  return (
    <Suspense fallback={<Links {...props} pathname={null} />}>
      <ActiveLinks {...props} />
    </Suspense>
  );
}

function ActiveLinks(props: { role: DashboardRole; badges: NavBadges; onNavigate?: () => void; only?: (item: NavItem) => boolean }) {
  return <Links {...props} pathname={usePathname()} />;
}

/** Splits the links into their headed groups, keeping their order. */
function groupItems(items: NavItem[]) {
  const groups: { label: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const label = item.group ?? "";
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function Links({
  role,
  badges,
  onNavigate,
  pathname,
  only,
}: {
  role: DashboardRole;
  badges: NavBadges;
  onNavigate?: () => void;
  pathname: string | null;
  only?: (item: NavItem) => boolean;
}) {
  const current = pathname === null ? null : activeHref(NAVIGATION[role], pathname);
  return (
    <div className="space-y-5">
      {groupItems(NAVIGATION[role].filter((item) => !only || only(item))).map((group, index) => (
        <div key={group.label}>
          {group.label && (
            <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-[0.12em] whitespace-nowrap text-gray-500 uppercase lg:collapsed:sr-only">
              {group.label}
            </p>
          )}
          {index > 0 && <div aria-hidden className="mx-auto mb-3 hidden h-px w-8 bg-line lg:collapsed:block" />}
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:collapsed:justify-center lg:collapsed:px-0 ${
                      active
                        ? "bg-brand-600 text-white shadow-[0_8px_20px_-8px_rgba(210,70,0,0.6)]"
                        : "text-muted hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <item.Icon className="size-5 shrink-0" aria-hidden />
                    <span className="truncate lg:collapsed:sr-only">{item.label}</span>
                    {badges[item.href]}
                    <RailTooltip>{item.label}</RailTooltip>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------- Sidebar ----------

/**
 * Floating sidebar for the vendor and admin dashboards (and the rider, from laptops up). On big
 * screens it hovers beside the page and can fold into an icon rail. On phones the vendor and admin
 * get a top bar and bottom tabs like the resident and rider apps, with the other pages under "More".
 *
 * `context` (the store or admin card) and `footer` (the signed-in user) come from the server.
 * `phone={false}` leaves the phone layout to the page's own shell (the rider's).
 */
export function SidebarNav({
  role,
  context,
  footer,
  badges,
  phone = true,
}: {
  role: DashboardRole;
  context: ReactNode;
  footer: ReactNode;
  badges: NavBadges;
  phone?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // Close the menu with the Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Big screens */}
      <aside aria-label="Main menu" className="fixed inset-y-4 left-4 z-30 hidden w-64 flex-col rounded-3xl border border-line/80 bg-white shadow-[0_16px_48px_-20px_rgba(31,45,61,0.28)] transition-[width] duration-300 ease-out lg:flex lg:collapsed:w-[76px]">
        <CollapseToggle />
        <div className="flex h-[76px] shrink-0 items-center px-6 lg:collapsed:justify-center lg:collapsed:px-0">
          <Brand role={role} />
        </div>
        <div className="shrink-0 px-3 pb-2">{context}</div>
        <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:collapsed:overflow-visible">
          <NavLinks role={role} badges={badges} />
        </nav>
        <div className="shrink-0 border-t border-line p-3">{footer}</div>
      </aside>

      {phone && (
        <>
          {/* Phones and tablets: a top bar like the resident and rider apps */}
          <header style={{ viewTransitionName: "app-header" }} className="sticky top-0 z-30 border-b border-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
            <div className="flex h-14 items-center justify-between gap-3 pr-2 pl-4">
              <span className="flex items-center gap-1">
                <PageBack role={role} variant="icon" />
                <Brand role={role} />
              </span>
              <NotificationBell allHref={role === "VENDOR" ? "/vendor/notifications" : "/admin/notifications"} />
            </div>
          </header>

          <BottomTabs role={role} badges={badges} onMore={() => setOpen(true)} moreOpen={open} />

          {open && (
            <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More pages">
              <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/35 backdrop-blur-[2px] motion-safe:animate-[fade-in_0.2s_ease-out]" onClick={() => setOpen(false)} />
              {/* A sheet that slides up from the bottom tabs */}
              <div className="absolute inset-x-2 bottom-2 flex max-h-[85dvh] flex-col overflow-hidden rounded-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl motion-safe:animate-[sheet-up_0.28s_cubic-bezier(0.22,1,0.36,1)]">
                <div className="flex shrink-0 items-center justify-between py-3 pr-3 pl-5">
                  <p className="text-base font-semibold text-ink">More</p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="flex size-10 items-center justify-center rounded-xl hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="shrink-0 px-3 pb-2">{context}</div>
                <nav aria-label="More pages" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  <NavLinks role={role} badges={badges} onNavigate={() => setOpen(false)} only={(item) => !(DASHBOARD_TABS[role] ?? []).includes(item.href)} />
                </nav>
                <div className="shrink-0 border-t border-line p-3">{footer}</div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------- Phone bottom tabs (vendor and admin) ----------

function BottomTabs(props: { role: DashboardRole; badges: NavBadges; onMore: () => void; moreOpen: boolean }) {
  return (
    <Suspense fallback={null}>
      <ActiveTabs {...props} />
    </Suspense>
  );
}

function ActiveTabs({ role, badges, onMore, moreOpen }: { role: DashboardRole; badges: NavBadges; onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();
  const items = NAVIGATION[role];
  const tabs = (DASHBOARD_TABS[role] ?? []).map((href) => items.find((i) => i.href === href)!).filter(Boolean);
  const current = activeHref(items, pathname);
  const onTab = tabs.some((t) => t.href === current);
  const here = tabs.findIndex((t) => t.href === current);
  const tab = (active: boolean) =>
    `flex h-full w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
      active ? "text-brand-700" : "text-muted hover:text-ink"
    }`;
  const pill = (active: boolean) => `relative flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-brand-50" : ""}`;

  return (
    <nav aria-label="Main" data-dash-tabbar style={{ viewTransitionName: "dash-tab-bar" }} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {tabs.map((item, index) => {
          const active = item.href === current && !moreOpen;
          return (
            <li key={item.href}>
              <Link href={item.href} transitionTypes={tabTypes(here, index)} aria-current={active ? "page" : undefined} className={`group ${tab(active)}`}>
                <span className={pill(active)}>
                  <item.Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {/* The live count (new orders, applications…), as a small badge on the icon */}
                  {badges[item.href] && (
                    <span className="absolute -top-1.5 left-[30px] [&>span]:ml-0 [&>span]:h-[18px] [&>span]:min-w-[18px] [&>span]:px-1 [&>span]:text-[0.625rem] [&>span]:ring-2 [&>span]:ring-white">
                      {badges[item.href]}
                    </span>
                  )}
                </span>
                {item.short ?? item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMore} aria-expanded={moreOpen} aria-haspopup="dialog" className={tab(moreOpen || !onTab)}>
            <span className={pill(moreOpen || !onTab)}>
              <Ellipsis className="size-5" strokeWidth={moreOpen || !onTab ? 2.25 : 1.75} aria-hidden />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
