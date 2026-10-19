"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { activeHref, NAVIGATION } from "@/lib/navigation";
import { ROLE_HOME } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { NotificationBell } from "./notification-bell";

type DashboardRole = Extract<Role, "VENDOR" | "ADMIN">;

function Logo({ role }: { role: DashboardRole }) {
  return (
    <Link href={ROLE_HOME[role]} className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
      <Image src="/Logo/feasto-logo.png" alt="Feasto" width={108} height={32} className="h-8 w-auto" priority />
    </Link>
  );
}

/** Reads the URL inside <Suspense> so pages with an id in the URL can still prerender. */
function NavLinks(props: { role: DashboardRole; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<Links {...props} pathname={null} />}>
      <ActiveLinks {...props} />
    </Suspense>
  );
}

function ActiveLinks(props: { role: DashboardRole; onNavigate?: () => void }) {
  return <Links {...props} pathname={usePathname()} />;
}

function Links({ role, onNavigate, pathname }: { role: DashboardRole; onNavigate?: () => void; pathname: string | null }) {
  const current = pathname === null ? null : activeHref(NAVIGATION[role], pathname);
  return (
    <ul className="space-y-1">
      {NAVIGATION[role].map((item) => {
        const active = item.href === current;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-canvas hover:text-ink"
              }`}
            >
              <item.Icon className={`size-[18px] ${active ? "text-brand-600" : ""}`} aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sidebar for the vendor and admin dashboards. On big screens it's always visible;
 * on small screens it becomes a top bar with a slide-out menu.
 */
export function SidebarNav({ role, footer }: { role: DashboardRole; footer: ReactNode }) {
  const [open, setOpen] = useState(false);
  const label = role === "VENDOR" ? "Store dashboard" : "Admin dashboard";

  return (
    <>
      {/* Big screens */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-white lg:flex">
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <Logo role={role} />
            <NotificationBell align="left" />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</p>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks role={role} />
        </nav>
        <div className="border-t border-line p-3">{footer}</div>
      </aside>

      {/* Small screens */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Logo role={role} />
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="flex size-10 items-center justify-center rounded-lg text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-line px-4">
              <Logo role={role} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex size-10 items-center justify-center rounded-lg hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3">
              <NavLinks role={role} onNavigate={() => setOpen(false)} />
            </nav>
            <div className="border-t border-line p-3">{footer}</div>
          </div>
        </div>
      )}
    </>
  );
}
