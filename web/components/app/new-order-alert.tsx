"use client";

import { useRef } from "react";
import { useLiveEvent } from "./live-updates";

/**
 * Plays a short two-tone chime when a new order arrives, so a busy store notices it.
 * Browsers only allow sound after the page has been clicked at least once.
 */
export function NewOrderAlert() {
  const audio = useRef<AudioContext | null>(null);

  useLiveEvent((event) => {
    if (event.type !== "notification" || !event.notification.title.startsWith("New order")) return;
    try {
      audio.current ??= new AudioContext();
      const ctx = audio.current;
      [880, 1175].forEach((frequency, i) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = frequency;
        const start = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
      });
    } catch {
      // Sound isn't essential; the toast still shows
    }
  });

  return null;
}
