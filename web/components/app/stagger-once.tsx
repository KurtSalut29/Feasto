"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Longer than the last child's delay plus its animation */
const STAGGER_MS = 600;

/** Set once the app has shown its first staggered screen, so it only happens when Feasto opens */
let played = false;

/**
 * Children rise in one after another (fx-stagger in globals.css), the first time this screen shows
 * after Feasto opens. Coming back to it later, it's just there: Home is visited all day long.
 * The server always renders the stagger, so the first paint and the app agree.
 */
export function StaggerOnce({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(() => !played);
  useEffect(() => {
    played = true;
    // Off once it has played, so it doesn't play again when Home is shown again
    const timer = setTimeout(() => setOn(false), STAGGER_MS);
    return () => clearTimeout(timer);
  }, []);
  return <div className={on ? "fx-stagger" : undefined}>{children}</div>;
}
