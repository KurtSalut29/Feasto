import { ViewTransition, type ReactNode } from "react";

/** How a page arrives and leaves (CSS in globals.css): a slide when a bottom tab was tapped, a fade otherwise */
const SLIDE = { "tab-forward": "tab-forward", "tab-back": "tab-back", default: "fx-fade" };

/**
 * Wraps each page (app/<role>/template.tsx, which mounts a new one per page). Tapping a bottom tab
 * to the right slides the next page in from the right, and to the left from the left, so the
 * pages feel laid out side by side like the tabs. Any other page change fades.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} default="none">
      <div className="fx-page">{children}</div>
    </ViewTransition>
  );
}

/** The transition type for going from one bottom tab to another: towards the right is forward. */
export const tabTypes = (from: number, to: number) => (from < 0 || from === to ? undefined : [to > from ? "tab-forward" : "tab-back"]);
