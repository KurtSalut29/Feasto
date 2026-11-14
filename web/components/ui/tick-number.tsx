"use client";

import { useState } from "react";

/**
 * A count that changes by tapping + or −: the new number comes in from the side it went
 * (fx-tick-up / fx-tick-down in globals.css). The first value just shows.
 */
export function TickNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [went, setWent] = useState<"up" | "down">();
  if (shown !== value) {
    setShown(value);
    setWent(value > shown ? "up" : "down");
  }
  return (
    // The class goes once it has played, so the number doesn't move again when the page is shown again
    <span key={value} onAnimationEnd={() => setWent(undefined)} className={`inline-block tabular-nums ${went ? `fx-tick-${went}` : ""}`}>
      {value}
    </span>
  );
}
