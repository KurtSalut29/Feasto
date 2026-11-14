"use client";

import { Search, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { activeHref, NAVIGATION } from "@/lib/navigation";
import { NotificationBell } from "./notification-bell";

const ITEMS = NAVIGATION.RESIDENT;
/** The account tab is the profile button on the right, not a link in the middle */
const LINKS = ITEMS.filter((item) => item.href !== "/resident/account");

/**
 * The resident's navigation on tablets, laptops and desktops, like a food delivery website:
 * the logo, the main pages, a search box, then notifications, the cart and the account.
 * Phones use the app's top bar and bottom tabs instead.
 */
export function ResidentTopNav({ end }: { end?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-line bg-white/90 backdrop-blur-md md:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6 lg:gap-6">
        <Link href="/resident" className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
          <Image src="/Logo/feasto-logo.png" alt="Feasto" width={108} height={32} className="h-8 w-[108px] object-contain" priority />
        </Link>

        <Suspense fallback={<Links current={null} />}>
          <ActiveLinks />
        </Suspense>

        {/* Search goes to the store list, where the results show */}
        <form action="/resident/stores" role="search" className="relative ml-auto hidden min-w-0 flex-1 lg:block lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" aria-hidden />
          <input
            type="search"
            name="q"
            placeholder="Search stores or dishes"
            aria-label="Search stores or dishes"
            className="h-10 w-full rounded-full border border-line bg-canvas pr-4 pl-9 text-sm text-ink transition placeholder:text-gray-500 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <Link
            href="/resident/stores"
            aria-label="Search stores or dishes"
            className="flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 lg:hidden"
          >
            <Search className="size-5" aria-hidden />
          </Link>
          <NotificationBell allHref="/resident/notifications" />
          {end}
          <Suspense fallback={<AccountLink active={false} />}>
            <ActiveAccount />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

function ActiveLinks() {
  return <Links current={activeHref(ITEMS, usePathname())} />;
}

function Links({ current }: { current: string | null }) {
  return (
    <nav aria-label="Main">
      <ul className="flex items-center gap-1">
        {LINKS.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                  active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-canvas hover:text-ink"
                }`}
              >
                <item.Icon className="size-[18px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ActiveAccount() {
  return <AccountLink active={activeHref(ITEMS, usePathname()) === "/resident/account"} />;
}

function AccountLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/resident/account"
      aria-label="Account"
      aria-current={active ? "page" : undefined}
      className={`ml-1 flex size-10 items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
        active ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700 hover:bg-brand-100"
      }`}
    >
      <User className="size-5" aria-hidden />
    </Link>
  );
}
