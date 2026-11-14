"use client";

import { useEffect, useRef, useState } from "react";
import { lessMotion } from "@/lib/display";

type Parsed = { before: string; after: string; n: number; decimals: number; grouped: boolean };

/** "₱12,345.50 today" → the number, and the text around it */
function parse(text: string): Parsed | null {
  const match = /-?\d[\d,]*(\.\d+)?/.exec(text);
  if (!match) return null;
  const raw = match[0];
  return {
    before: text.slice(0, match.index),
    after: text.slice(match.index + raw.length),
    n: Number(raw.replace(/,/g, "")),
    decimals: match[1] ? match[1].length - 1 : 0,
    grouped: raw.includes(","),
  };
}

function show(shape: Parsed, n: number) {
  const digits = shape.grouped || Math.abs(n) >= 1000
    ? n.toLocaleString("en-PH", { minimumFractionDigits: shape.decimals, maximumFractionDigits: shape.decimals })
    : n.toFixed(shape.decimals);
  return `${shape.before}${digits}${shape.after}`;
}

/** How long a changed number takes to count to its new value */
const COUNT_MS = 600;

/**
 * A figure that counts from its old value to its new one when it changes while the page is open
 * (a live dashboard getting a new order). The first value just shows: data being read shouldn't
 * move for style. People who asked for less motion see the new value straight away.
 */
export function TickingValue({ value }: { value: string | number }) {
  const text = String(value);
  const [counting, setCounting] = useState<string | null>(null);
  const previous = useRef(text);

  useEffect(() => {
    const from = parse(previous.current);
    const to = parse(text);
    previous.current = text;
    if (!from || !to || from.before !== to.before || from.after !== to.after || from.n === to.n) return;
    if (lessMotion()) return;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out: quick to move, gentle to land
      setCounting(t < 1 ? show(to, from.n + (to.n - from.n) * eased) : null);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text]);

  return <>{counting ?? text}</>;
}
