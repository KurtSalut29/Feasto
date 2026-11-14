"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * The chosen tab's background (pill) or underline, drawn once and slid to whichever tab is chosen
 * (a clip-path transition, globals.css). Put it as the first child of the row of tab links. Until
 * it has measured the tabs, the chosen link draws itself, so nothing is missing without JavaScript.
 */
export function SlideIndicator({ kind }: { kind: "pill" | "underline" }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const indicator = ref.current;
    const frame = indicator?.parentElement;
    const row = frame?.parentElement;
    if (!indicator || !frame || !row) return;
    let placed = false;
    const place = () => {
      const active = row.querySelector<HTMLElement>(':scope > a[aria-current="page"]');
      if (!active) {
        frame.style.opacity = "0";
        delete row.dataset.slide;
        return;
      }
      const left = active.offsetLeft;
      indicator.style.setProperty("--fx-l", `${left}px`);
      indicator.style.setProperty("--fx-r", `${left + active.offsetWidth}px`);
      frame.style.opacity = "1";
      row.dataset.slide = "on";
      // Appears in place the first time; slides after that
      if (placed) indicator.dataset.moving = "";
      placed = true;
    };
    place();
    const resized = new ResizeObserver(place);
    resized.observe(row);
    const changed = new MutationObserver(place);
    changed.observe(row, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, []);

  // The pill's hairline border and shadow come from drop-shadow on the frame, which follows the
  // clipped shape (a ring or box-shadow on the pill itself would be clipped away)
  return kind === "pill" ? (
    <span aria-hidden className="pointer-events-none absolute inset-y-1 left-0 w-full opacity-0 [filter:drop-shadow(0_0_0.5px_#d0d5dd)_drop-shadow(0_1px_1px_rgba(16,24,40,0.08))]">
      <span ref={ref} className="fx-indicator absolute inset-0 bg-white [--fx-round:0.5rem]" />
    </span>
  ) : (
    <span aria-hidden className="pointer-events-none absolute -bottom-px left-0 h-0.5 w-full opacity-0">
      <span ref={ref} className="fx-indicator absolute inset-0 bg-brand-600" />
    </span>
  );
}
