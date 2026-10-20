import type { ReactNode } from "react";

const tones = {
  neutral: "bg-gray-100 text-gray-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
};

const dots: Record<keyof typeof tones, string> = {
  neutral: "bg-gray-400",
  brand: "bg-brand-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
};

export type BadgeTone = keyof typeof tones;

/** A small rounded label. `dot` adds a status dot before the text. */
export function Badge({ tone = "neutral", dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${tones[tone]}`}>
      {dot && <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  );
}
