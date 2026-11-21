"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { benefitWords, type VoucherCard } from "@/lib/promos";

type Campaign = { id: string; name: string; tagline: string | null; startsAt: string; endsAt: string; live: boolean; vouchers: VoucherCard[] };

/** "2d 4h", "3h 05m", "12m 09s" */
function left(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * The sale day on Home (11.11, 12.12, payday): its name, how long it has left (or until it
 * starts), and its vouchers. Nothing shows when there's no sale this week.
 */
export function SaleBanner() {
  const { data } = useApiData<{ campaign: Campaign | null }>("/promos/campaign");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = data?.campaign;
  if (!c) return null;
  const live = new Date(c.startsAt).getTime() <= now;
  const until = live ? new Date(c.endsAt).getTime() - now : new Date(c.startsAt).getTime() - now;
  if (live && until <= 0) return null;
  return (
    <section aria-label={c.name} className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-600 to-rose-600 p-4 text-white shadow-[0_8px_24px_-12px_rgba(220,38,38,0.55)] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.14em] text-white/80 uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            {live ? "Sale on now" : "Coming soon"}
          </p>
          <h2 className="mt-0.5 text-2xl leading-tight font-extrabold tracking-tight">{c.name}</h2>
          {c.tagline && <p className="mt-0.5 text-sm text-white/90">{c.tagline}</p>}
        </div>
        <p className="shrink-0 rounded-2xl bg-white/15 px-3 py-2 text-center">
          <span className="block text-[0.6875rem] font-semibold tracking-wide text-white/80 uppercase">{live ? "Ends in" : "Starts in"}</span>
          <span className="block font-mono text-lg font-bold tabular-nums" aria-live="off">
            {left(until)}
          </span>
        </p>
      </div>
      {c.vouchers.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {c.vouchers.map((v) => (
            <li key={v.id} className="shrink-0 rounded-xl border border-dashed border-white/60 bg-white/10 px-3 py-2">
              <span className="block text-sm font-bold">{benefitWords(v)}</span>
              <span className="block text-xs text-white/85">
                {v.code}
                {v.minSpend ? ` · min. ₱${v.minSpend}` : ""}
                {v.problem ? ` · ${v.problem}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href="/resident/vouchers" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white underline-offset-2 hover:underline">
        {live ? "Use them at checkout" : "See your vouchers"}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
