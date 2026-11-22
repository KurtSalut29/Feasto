"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { VoucherTicket } from "@/components/app/voucher-ticket";
import { type VoucherCard } from "@/lib/promos";

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
    <section aria-label={c.name} className="mt-7 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-rose-50 p-4 ring-1 ring-brand-100 md:grid md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-center md:gap-x-6 md:p-5">
      <div className="flex items-start justify-between gap-3 md:col-start-1 md:row-start-1 md:flex-col md:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.14em] text-brand-700 uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            {live ? "Sale on now" : "Coming soon"}
          </p>
          <h2 className="text-lg leading-tight font-extrabold tracking-tight text-ink">{c.name}</h2>
          {c.tagline && <p className="truncate text-[0.8125rem] text-muted">{c.tagline}</p>}
        </div>
        <p className="shrink-0 rounded-xl bg-gradient-to-br from-brand-600 to-rose-600 px-2.5 py-1.5 text-center text-white shadow-sm">
          <span className="block text-[0.5625rem] font-semibold tracking-wider text-white/85 uppercase">{live ? "Ends in" : "Starts in"}</span>
          <span className="block font-mono text-sm leading-tight font-bold tabular-nums" aria-live="off">
            {left(until)}
          </span>
        </p>
      </div>
      {c.vouchers.length === 1 ? (
        // One voucher: as wide as the card (no sideways scroll to clip its shadow)
        <div className="mt-3 mb-3 md:col-start-2 md:row-span-2 md:row-start-1 md:my-0 md:max-w-md">
          <VoucherTicket voucher={c.vouchers[0]!} compact fill />
        </div>
      ) : (
        c.vouchers.length > 1 && (
          // Several: they slide sideways, edge to edge of the card, with room for their shadow
          <ul className="-mx-4 mt-1 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-3 pb-5 [scrollbar-width:none] md:col-start-2 md:row-span-2 md:row-start-1 md:mx-0 md:my-0 md:px-1">
            {c.vouchers.map((v) => (
              <li key={v.id} className="snap-start">
                <VoucherTicket voucher={v} compact />
              </li>
            ))}
          </ul>
        )
      )}
      <Link href="/resident/vouchers" className="tap inline-flex items-center gap-0.5 text-sm font-semibold text-brand-700 hover:underline md:col-start-1 md:row-start-2 md:self-start">
        {live ? "Use them at checkout" : "See all your vouchers"}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
