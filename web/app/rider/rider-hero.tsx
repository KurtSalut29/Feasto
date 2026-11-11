import { ChevronRight, Coffee, Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPeso, mealTime, weekdayLabel, type MealTime } from "@/lib/format";

/** The rush a rider is riding into, by the time in Manila */
const SHIFTS: Record<MealTime, { Icon: LucideIcon; label: string; line: string }> = {
  breakfast: { Icon: Sunrise, label: "Morning shift", line: "Breakfast orders are starting. Stay near the stores." },
  lunch: { Icon: Sun, label: "Lunch rush", line: "Lunch rush. Jobs come in fast, so keep the app open." },
  merienda: { Icon: Coffee, label: "Merienda hours", line: "Merienda orders are coming in. Short trips, quick pay." },
  dinner: { Icon: Sunset, label: "Dinner rush", line: "Dinner rush, the busiest hours of the day." },
  late: { Icon: Moon, label: "Late night", line: "Late night. Fewer jobs, but some stores are still open." },
};

/** Earnings are delivery fees plus tips; `tips` is the tips' part */
export type Totals = { today: { count: number; earnings: number; tips: number }; allTime: { count: number; earnings: number; tips: number } };

/**
 * The top of the rider's Home: hello by name, the rush it is now and whether they're getting
 * jobs, then today's pay at a glance (it opens History).
 */
export function RiderHero({ firstName, online, totals, line }: { firstName: string; online?: boolean; totals?: Totals; line?: string }) {
  const shift = SHIFTS[mealTime()];
  const status = line ?? (online ? shift.line : "You're offline. Turn on Online at the top to get jobs.");
  return (
    <section
      aria-label="Welcome"
      className="relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-[0_14px_30px_-16px_rgba(178,58,0,0.8)]"
    >
      <span aria-hidden className="absolute -top-14 -right-12 size-48 rounded-full bg-brand-500/70" />
      <span aria-hidden className="absolute top-20 -right-4 size-16 rounded-full bg-white/10" />
      <Image
        src="/Logo/feasto-mascot.png"
        alt=""
        width={96}
        height={96}
        preload
        className="absolute top-2 -right-2 size-24 rotate-[-8deg] object-contain drop-shadow-[0_6px_8px_rgba(80,25,0,0.35)]"
      />

      <div className="relative pr-24">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-brand-100 uppercase">
          <shift.Icon className="size-3.5" aria-hidden />
          {weekdayLabel()} · {shift.label}
        </p>
        <h1 className="mt-1.5 text-[26px] leading-tight font-bold tracking-tight">Hi, {firstName}!</h1>
        <p className="mt-1 text-sm text-white/90">{status}</p>
      </div>

      {totals && (
        <Link
          href="/rider/history"
          aria-label={`Earned ${formatPeso(totals.today.earnings)} today from ${totals.today.count} ${totals.today.count === 1 ? "delivery" : "deliveries"}. See history`}
          className="relative mt-4 flex items-center rounded-2xl bg-white/15 py-2.5 pr-2 pl-3.5 ring-1 ring-white/30 transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-white/80">Earned today</span>
            <span className="block text-xl leading-tight font-bold tabular-nums">{formatPeso(totals.today.earnings)}</span>
          </span>
          <span className="border-l border-white/25 px-3.5 text-center">
            <span className="block text-xl leading-tight font-bold tabular-nums">{totals.today.count}</span>
            <span className="block text-[11px] text-white/80">{totals.today.count === 1 ? "delivery" : "deliveries"}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-white/90" aria-hidden />
        </Link>
      )}
    </section>
  );
}
