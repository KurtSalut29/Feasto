import type { FocusEvent, PointerEvent, ReactNode } from "react";

/**
 * Label shown beside a sidebar link when the sidebar is folded into an icon rail and the
 * pointer or keyboard focus is on it. The link itself needs the `group` class and `placeRailTooltip`
 * on its pointer-enter and focus.
 *
 * The links scroll when they don't all fit, and a scrolling box cuts off anything poking out of
 * it. So the label is `fixed` (drawn above everything) just past the rail's edge, at the height
 * the link reports when it's pointed at.
 */
export function RailTooltip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none fixed top-(--rail-tip-y,0) left-[6.5rem] z-50 hidden -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg motion-safe:animate-[fade-in_0.15s_ease-out] lg:collapsed:group-hover:block lg:collapsed:group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/** Tells the link's label how far down the screen the link is, after any scrolling */
export function placeRailTooltip(event: PointerEvent<HTMLElement> | FocusEvent<HTMLElement>) {
  const link = event.currentTarget;
  const box = link.getBoundingClientRect();
  link.style.setProperty("--rail-tip-y", `${box.top + box.height / 2}px`);
}
