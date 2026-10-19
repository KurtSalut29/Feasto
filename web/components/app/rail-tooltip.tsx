import type { ReactNode } from "react";

/**
 * Label shown beside a sidebar link when the sidebar is folded into an icon rail and the
 * pointer or keyboard focus is on it. The link itself needs the `group` class.
 */
export function RailTooltip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-full z-50 ml-4 hidden -translate-y-1/2 translate-x-1 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 lg:collapsed:block"
    >
      {children}
    </span>
  );
}
