"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Which ids each list has already shown, kept for as long as the app is open. A list's items that
 * were there when it first appeared are just there; only the ones that arrive later (a new order,
 * a new job, pushed in live) get the entrance animation.
 */
const lists = new Map<string, { since: number; seen: Set<string> }>();
/** Anything showing up this soon after the list did is part of its first load */
const FIRST_LOAD_MS = 1500;

function isNew(list: string, id: string) {
  if (typeof window === "undefined") return false;
  let known = lists.get(list);
  if (!known) {
    known = { since: Date.now(), seen: new Set() };
    lists.set(list, known);
  }
  return Date.now() - known.since > FIRST_LOAD_MS && !known.seen.has(id);
}

/**
 * The entrance class for one item of a live list (empty unless it arrived after the list's first
 * load), and the handler that takes it off once it has played, so it doesn't play again when the
 * page is shown again.
 */
export function useArrival(list: string | undefined, id: string, effect: "arrive" | "rise" = "arrive") {
  const [fresh, setFresh] = useState(() => (list ? isNew(list, id) : false));
  useEffect(() => {
    if (list) lists.get(list)?.seen.add(id);
  }, [list, id]);
  const last = effect === "rise" ? "fx-rise-up" : "fx-glow";
  return {
    className: fresh ? (effect === "rise" ? "fx-rise-up" : "fx-arrive") : "",
    onAnimationEnd: (e: React.AnimationEvent) => {
      if (e.animationName === last) setFresh(false);
    },
  };
}

/**
 * Wraps one item of a live list. A new order slides down into the queue with a soft orange glow
 * that fades; a new job rises from below (globals.css: fx-arrive, fx-rise-up).
 */
export function Arrival({ list, id, effect = "arrive", className = "", children }: { list: string; id: string; effect?: "arrive" | "rise"; className?: string; children: ReactNode }) {
  const fx = useArrival(list, id, effect);
  return (
    <div onAnimationEnd={fx.onAnimationEnd} className={`${fx.className} ${className}`}>
      {children}
    </div>
  );
}
