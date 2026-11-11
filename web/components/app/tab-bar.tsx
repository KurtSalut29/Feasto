"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { activeHref, isTabPage, NAVIGATION } from "@/lib/navigation";
import type { Role } from "@/lib/types";

type MobileRole = Extract<Role, "RESIDENT" | "RIDER">;

/**
 * Bottom navigation for the mobile roles (resident and rider), shown only on the main tab
 * pages; a store, the cart or an order fills the screen and has a back arrow instead.
 * Reading the current URL happens inside <Suspense> so pages with an id in the URL can still prerender.
 */
export function TabBar({ role }: { role: MobileRole }) {
  return (
    <Suspense fallback={null}>
      <ActiveTabs role={role} />
    </Suspense>
  );
}

function ActiveTabs({ role }: { role: MobileRole }) {
  return <Tabs role={role} pathname={usePathname()} />;
}

function Tabs({ role, pathname }: { role: MobileRole; pathname: string }) {
  const items = NAVIGATION[role];
  if (!isTabPage(role, pathname)) return null;
  const current = activeHref(items, pathname);

  return (
    // Hidden where the big-screen navigation takes over: the resident's top bar from tablets up,
    // the rider's sidebar from laptops up. data-tabbar says when, for the page's bottom spacing.
    <nav
      aria-label="Main"
      data-tabbar={role === "RESIDENT" ? "md" : "lg"}
      className={`fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[440px] border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur ${
        role === "RESIDENT" ? "md:hidden" : "md:max-w-2xl lg:hidden"
      }`}
    >
      <ul className={`grid h-16 ${items.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
                  active ? "text-brand-700" : "text-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-brand-50" : ""}`}
                >
                  <item.Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
