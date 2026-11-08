import type { OrderStatus } from "@/lib/types";

/** The stages an order passes through while the store is handling it, in order. */
export const STAGES = [
  { key: "new", label: "New", statuses: ["PLACED"], dot: "bg-amber-500" },
  { key: "kitchen", label: "In the kitchen", statuses: ["ACCEPTED", "PREPARING"], dot: "bg-brand-500" },
  { key: "ready", label: "Ready", statuses: ["READY"], dot: "bg-emerald-500" },
  { key: "out", label: "On the way", statuses: ["PICKED_UP"], dot: "bg-sky-500" },
] as const satisfies { key: string; label: string; statuses: OrderStatus[]; dot: string }[];

export type StageKey = (typeof STAGES)[number]["key"];

export const stageOf = (status: OrderStatus) => STAGES.find((s) => (s.statuses as readonly OrderStatus[]).includes(status));

export const isStageKey = (value: unknown): value is StageKey => STAGES.some((s) => s.key === value);

/**
 * How long is too long, in minutes since the order was placed: past `soon` the clock turns amber,
 * past `late` it turns red. Orders already on the way don't wait on the store.
 */
const LIMITS: Partial<Record<OrderStatus, { soon: number; late: number }>> = {
  PLACED: { soon: 5, late: 10 },
  ACCEPTED: { soon: 20, late: 35 },
  PREPARING: { soon: 20, late: 35 },
  READY: { soon: 30, late: 45 },
};

export type WaitTone = "calm" | "soon" | "late";

export function waitTone(status: OrderStatus, minutes: number): WaitTone {
  const limit = LIMITS[status];
  if (!limit) return "calm";
  return minutes >= limit.late ? "late" : minutes >= limit.soon ? "soon" : "calm";
}

/** "1st", "2nd", "3rd", "11th" */
export function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
