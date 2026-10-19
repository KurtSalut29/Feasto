"use client";

import { ChevronLeft, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { activeHref, NAVIGATION, type NavItem } from "@/lib/navigation";
import { ROLE_HOME } from "@/lib/roles";
import { SIDEBAR_STORAGE_KEY } from "@/lib/sidebar";
import type { Role } from "@/lib/types";
import { NotificationBell } from "./notification-bell";
import { RailTooltip } from "./rail-tooltip";

type DashboardRole = Extract<Role, "VENDOR" | "ADMIN">;

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
      <Image src="/Logo/feasto-logo.png" alt="" width={108} height={32} className="h-8 w-auto lg:collapsed:hidden" priority />
      <Image src="/Logo/feasto-mascot.png" alt="" width={40} height={40} className="hidden size-10 lg:collapsed:block" />
    </Link>
  );
}

/** Reads the URL inside <Suspense> so pages with an id in the URL can still prerender. */
function NavLinks(props: { role: DashboardRole; badges: NavBadges; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<Links {...props} pathname={null} />}>
      <ActiveLinks {...props} />
    </Suspense>
  );
}

function ActiveLinks(props: { role: DashboardRole; badges: NavBadges; onNavigate?: () => void }) {
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
}: {
  role: DashboardRole;
  badges: NavBadges;
  onNavigate?: () => void;
  pathname: string | null;
}) {
  const current = pathname === null ? null : activeHref(NAVIGATION[role], pathname);
  return (
    <div className="space-y-5">
      {groupItems(NAVIGATION[role]).map((group, index) => (
        <div key={group.label}>
          {group.label && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-gray-400 uppercase lg:collapsed:sr-only">
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
 * Floating sidebar for the vendor and admin dashboards. On big screens it hovers beside the page
 * and can fold into an icon rail; on small screens it becomes a top bar with a slide-out menu.
 *
 * `context` (the store or admin card) and `footer` (the signed-in user) come from the server.
 */
export function SidebarNav({
  role,
  context,
  footer,
  badges,
}: {
  role: DashboardRole;
  context: ReactNode;
  footer: ReactNode;
  badges: NavBadges;
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
      <aside className="fixed inset-y-4 left-4 z-30 hidden w-64 flex-col rounded-3xl border border-line/80 bg-white shadow-[0_16px_48px_-20px_rgba(31,45,61,0.28)] transition-[width] duration-300 ease-out lg:flex lg:collapsed:w-[76px]">
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

      {/* Small screens */}
      <header className="sticky top-0 z-30 px-3 pt-3 lg:hidden">
        <div className="flex h-14 items-center justify-between rounded-2xl border border-line/80 bg-white/90 pr-1.5 pl-4 shadow-[0_8px_24px_-16px_rgba(31,45,61,0.35)] backdrop-blur">
          <Brand role={role} />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="flex size-10 items-center justify-center rounded-xl text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-3 left-3 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col rounded-3xl bg-white shadow-2xl">
            <div className="flex h-[72px] shrink-0 items-center justify-between pr-3 pl-6">
              <Brand role={role} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-10 items-center justify-center rounded-xl hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="shrink-0 px-3 pb-2">{context}</div>
            <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <NavLinks role={role} badges={badges} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="shrink-0 border-t border-line p-3">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
