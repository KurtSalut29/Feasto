"use client";

import Image from "next/image";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Chef Feasto pops up for the big moments: an order placed, an order delivered, a delivery
 * finished. He jumps in over a confetti burst with a speech bubble, stays a few seconds and
 * leaves by himself (or on a tap anywhere). Mounted once in the root layout, so it keeps showing
 * while the app moves to the next page.
 *
 *   celebrate({ title: "Order placed!", message: "Jollibee Naval got your order." })
 */

export type Celebration = {
  title: string;
  message?: string;
  /** How long it stays, in milliseconds */
  duration?: number;
};

type Shown = Celebration & { id: number; leaving: boolean };

const MASCOT = "/Logo/feasto-mascot.png";
const LEAVE_MS = 300;

let current: Shown | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function celebrate(celebration: Celebration) {
  current = { ...celebration, id: nextId++, leaving: false };
  emit();
}

function close(id: number) {
  if (!current || current.id !== id || current.leaving) return;
  current = { ...current, leaving: true };
  emit();
  setTimeout(() => {
    if (current?.id === id) {
      current = null;
      emit();
    }
  }, LEAVE_MS);
}

/** True while chef Feasto is on screen, so other moments (the receipt) can wait their turn. */
export function useCelebrating() {
  return useSyncExternalStore(
    subscribe,
    () => current !== null,
    () => false,
  );
}

// Confetti pieces: where each one flies, how far it spins, its color and shape
const COLORS = ["#fe5502", "#ffb020", "#22c55e", "#38bdf8", "#f472b6", "#d24600"];
const PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.3;
  const distance = 120 + ((i * 37) % 70);
  return {
    x: Math.round(Math.cos(angle) * distance),
    // A little gravity: the pieces end lower than they'd fly on their own
    y: Math.round(Math.sin(angle) * distance * 0.8 + 50),
    r: ((i * 83) % 540) - 270,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
  };
});

export function CelebrationHost() {
  const shown = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const okRef = useRef<HTMLButtonElement>(null);

  // Load the chef ahead of time, so he's ready the moment an order is placed
  useEffect(() => {
    const load = () => {
      const img = new window.Image();
      img.src = MASCOT;
    };
    const idle = window.requestIdleCallback?.(load) ?? window.setTimeout(load, 1500);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle));
  }, []);

  const id = shown?.id;
  const duration = shown?.duration ?? 3400;
  useEffect(() => {
    if (id === undefined) return;
    okRef.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => close(id), duration);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(id);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [id, duration]);

  if (!shown) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => close(shown.id)}
      className={`fixed inset-0 z-[110] flex items-center justify-center px-6 ${shown.leaving ? "fx-leaving" : ""}`}
    >
      <div aria-hidden className="fx-backdrop absolute inset-0 bg-ink/45 backdrop-blur-[3px]" />
      <div key={shown.id} className="fx-stage relative flex w-full max-w-[320px] flex-col items-center text-center">
        {/* The speech bubble */}
        <div className="fx-bubble relative mb-3 rounded-[22px] bg-white px-5 py-3 shadow-[0_18px_40px_-16px_rgba(31,45,61,0.55)]">
          <p className="text-[1.375rem] leading-tight font-bold tracking-tight text-ink">{shown.title}</p>
          <span aria-hidden className="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-[3px] bg-white" />
        </div>

        {/* The chef, with rings and confetti bursting out behind him */}
        <div className="relative size-44">
          <span aria-hidden className="fx-halo absolute inset-2 rounded-full border-[6px] border-brand-500/70 opacity-0" />
          <span aria-hidden className="fx-halo fx-halo-late absolute inset-2 rounded-full border-4 border-amber-300/80 opacity-0" />
          {PIECES.map((p, i) => (
            <span
              key={i}
              aria-hidden
              className={`fx-confetti absolute top-1/2 left-1/2 opacity-0 ${p.round ? "size-2.5 rounded-full" : "h-3.5 w-2 rounded-[2px]"}`}
              style={{ background: p.color, "--x": `${p.x}px`, "--y": `${p.y}px`, "--r": `${p.r}deg` } as React.CSSProperties}
            />
          ))}
          <Image
            src={MASCOT}
            alt=""
            width={176}
            height={176}
            unoptimized
            priority
            className="fx-mascot relative size-44 drop-shadow-[0_14px_22px_rgba(31,45,61,0.35)]"
          />
        </div>

        {shown.message && <p className="fx-rise relative mt-3 text-[0.9375rem] leading-snug font-medium text-white [--fx-delay:0.55s]">{shown.message}</p>}
        <button
          ref={okRef}
          type="button"
          className="fx-rise mt-5 h-10 rounded-full bg-white/15 px-6 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white [--fx-delay:0.7s]"
        >
          Okay
        </button>
      </div>
    </div>
  );
}
