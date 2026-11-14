"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { isDeadEnd, isTabPage, parentPage } from "@/lib/navigation";
import { ROLE_HOME } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { BackButton, useCountPages } from "./back-button";

/**
 * Back, on every page but the role's home, for every role and screen size: an arrow in the
 * phone top bar ("icon"), and a "Back" button above the page on big screens ("pill"), where
 * there's no top bar. It returns to the page you came from (see BackButton), or the page above
 * this one when there's none.
 */
export function PageBack({ role, variant, className = "" }: { role: Role; variant: "icon" | "pill"; className?: string }) {
  return (
    <Suspense fallback={null}>
      <Back role={role} variant={variant} className={className} />
    </Suspense>
  );
}

function Back({ role, variant, className }: { role: Role; variant: "icon" | "pill"; className: string }) {
  const pathname = usePathname();
  useCountPages();
  if (pathname === ROLE_HOME[role]) return null;
  return (
    <span className={className}>
      <BackButton
        variant={variant}
        fallback={parentPage(role, pathname)}
        isMain={(path) => isTabPage(role, path)}
        skip={(target) => isDeadEnd(pathname, target)}
      />
    </span>
  );
}
