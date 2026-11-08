"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { isDeadEnd, isTabPage, parentPage } from "@/lib/navigation";
import { ROLE_HOME } from "@/lib/roles";
import { BackButton, useCountPages } from "./back-button";

type MobileRole = "RESIDENT" | "RIDER";

/**
 * Left side of the phone top bar: the logo on the main tabs, and a back arrow before it on
 * every other page (a store, the cart, an order), where the bottom tabs are hidden.
 */
export function HeaderStart({ role }: { role: MobileRole }) {
  return (
    <Suspense fallback={<Logo role={role} />}>
      <WithBack role={role} />
    </Suspense>
  );
}

function WithBack({ role }: { role: MobileRole }) {
  const pathname = usePathname();
  useCountPages();
  if (isTabPage(role, pathname)) return <Logo role={role} />;
  return (
    <div className="flex items-center gap-1">
      <BackButton fallback={parentPage(role, pathname)} isMain={(path) => isTabPage(role, path)} skip={(target) => isDeadEnd(pathname, target)} />
      <Logo role={role} />
    </div>
  );
}

function Logo({ role }: { role: MobileRole }) {
  return (
    <Link href={ROLE_HOME[role]} className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500">
      {/* Both sizes set exactly, so the browser's rounding never disagrees with Next.js */}
      <Image src="/Logo/feasto-logo.png" alt="Feasto" width={95} height={28} className="h-7 w-[95px] shrink-0 object-contain" priority />
    </Link>
  );
}
