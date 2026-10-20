import { ArrowUpRight, Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";

const ACCENTS = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  sky: "bg-sky-50 text-sky-600 ring-sky-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  gray: "bg-canvas text-muted ring-line",
};

export type Accent = keyof typeof ACCENTS;

/** Percent change from `previous` to `current`, or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** "▲ 12%" in green, "▼ 8%" in red, "– 0%" in gray. */
export function Trend({ change, label }: { change: number | null; label: string }) {
  if (change === null) return <p className="text-xs text-muted">{label}</p>;
  const rounded = Math.round(change);
  const [Icon, tone, word] =
    rounded > 0
      ? [TrendingUp, "bg-emerald-50 text-emerald-700", "Up"]
      : rounded < 0
        ? [TrendingDown, "bg-red-50 text-red-700", "Down"]
        : [Minus, "bg-gray-100 text-gray-600", "No change,"];
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${tone}`}>
        <Icon className="size-3.5" aria-hidden />
        <span className="sr-only">{word}</span>
        {Math.abs(rounded)}%
      </span>
      {label}
    </p>
  );
}

/** One number with its label, e.g. "Sales today ₱860.00". */
export function StatCard({
  label,
  value,
  hint,
  Icon,
  accent = "gray",
  highlight,
  change,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  Icon: LucideIcon;
  accent?: Accent;
  /** Draws attention when the number needs action, e.g. new orders */
  highlight?: boolean;
  /** Percent change shown as a trend chip; `hint` becomes its label */
  change?: number | null;
  /** Makes the whole card a link */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-xl ring-1 ${highlight ? "bg-brand-600 text-white ring-brand-600" : ACCENTS[accent]}`}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {href && <ArrowUpRight className="size-4 text-gray-400 transition group-hover:text-brand-600" aria-hidden />}
      </div>
      <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-[28px] leading-tight font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      <div className="mt-2 min-h-5">
        {change !== undefined ? <Trend change={change} label={hint ?? ""} /> : hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    </>
  );

  const box = `group block rounded-2xl border p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition ${
    highlight ? "border-brand-100 bg-gradient-to-br from-brand-50 to-white" : "border-line bg-white"
  }`;

  if (href) {
    return (
      <Link
        href={href}
        className={`${box} hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-16px_rgba(16,24,40,0.35)] focus-visible:outline-2 focus-visible:outline-brand-500`}
      >
        {body}
      </Link>
    );
  }
  return <div className={box}>{body}</div>;
}
