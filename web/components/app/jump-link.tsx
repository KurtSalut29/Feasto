"use client";

import type { ReactNode } from "react";
import { lessMotion } from "@/lib/display";

/**
 * A link to a part of the same page ("Hours & map", the reviews) that scrolls there without adding
 * a history entry, so Back still leaves the page instead of scrolling up it.
 */
export function JumpLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(event) => {
        const target = document.getElementById(to);
        if (!target) return;
        event.preventDefault();
        const smooth = !lessMotion();
        target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
        // Keyboard and screen reader users continue from the section they jumped to
        target.focus({ preventScroll: true });
      }}
    >
      {children}
    </a>
  );
}
