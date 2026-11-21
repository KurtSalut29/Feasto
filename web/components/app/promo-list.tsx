"use client";

import { BadgePercent, Clock, Pause, Play, TicketPercent, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatPeso } from "@/lib/format";
import { benefitWords } from "@/lib/promos";

export type PromoRow = {
  id: string;
  kind: "DEAL" | "VOUCHER";
  code: string | null;
  title: string;
  benefit: "PERCENT_OFF" | "AMOUNT_OFF" | "FREE_DELIVERY" | "DELIVERY_OFF";
  value: number;
  maxDiscount: number | null;
  minSpend: number;
  budget: number | null;
  startsAt: string;
  endsAt: string | null;
  hours: string | null;
  isActive: boolean;
  audience?: "EVERYONE" | "FIRST_ORDER";
  vendor?: { name: string } | null;
  campaign?: { name: string } | null;
  menuItemIds?: string[];
  uses: number;
  given: number;
  feastoSpent: number;
  storeSpent: number;
};

/** A list of deals and vouchers with how much each has been used and what it cost, and pause/resume */
export function PromoList({ rows, onToggle, who }: { rows: PromoRow[]; onToggle: (row: PromoRow) => void; who: "admin" | "store" }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((p) => {
        const Icon = p.kind === "DEAL" ? BadgePercent : p.benefit === "FREE_DELIVERY" || p.benefit === "DELIVERY_OFF" ? Truck : TicketPercent;
        const ended = p.endsAt && new Date(p.endsAt) <= new Date();
        const spentShare = p.budget ? Math.min(100, (p.feastoSpent / p.budget) * 100) : null;
        return (
          <li key={p.id} className={`flex flex-wrap items-start gap-3 py-3 ${p.isActive && !ended ? "" : "opacity-60"}`}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                {p.title}
                {p.code && <span className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-xs tracking-wider">{p.code}</span>}
                {!p.isActive ? <Badge tone="neutral">Paused</Badge> : ended ? <Badge tone="neutral">Ended</Badge> : <Badge tone="success">On</Badge>}
                {p.audience === "FIRST_ORDER" && <Badge tone="brand">First order</Badge>}
                {p.campaign && <Badge tone="brand">{p.campaign.name}</Badge>}
              </p>
              <p className="text-sm text-muted">
                {benefitWords(p)}
                {p.minSpend ? ` · min. ${formatPeso(p.minSpend)}` : ""}
                {p.vendor ? ` · ${p.vendor.name} only` : ""}
                {p.kind === "DEAL" ? ` · ${p.menuItemIds?.length ? `${p.menuItemIds.length} dishes` : "whole menu"}` : ""}
              </p>
              <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                {p.hours && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" aria-hidden />
                    {p.hours}
                  </span>
                )}
                <span>
                  {formatDateTime(p.startsAt)}
                  {p.endsAt ? ` to ${formatDateTime(p.endsAt)}` : " onwards"}
                </span>
              </p>
              <p className="mt-1 text-sm text-ink">
                Used on {p.uses} {p.uses === 1 ? "order" : "orders"} · {formatPeso(p.given)} off in all
                {who === "admin" && p.budget ? ` · Feasto paid ${formatPeso(p.feastoSpent)} of ${formatPeso(p.budget)}` : who === "admin" && p.feastoSpent ? ` · Feasto paid ${formatPeso(p.feastoSpent)}` : ""}
              </p>
              {spentShare !== null && (
                <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-canvas" role="img" aria-label={`${Math.round(spentShare)}% of the budget used`}>
                  <div className={`h-full rounded-full ${spentShare >= 90 ? "bg-red-500" : "bg-brand-600"}`} style={{ width: `${spentShare}%` }} />
                </div>
              )}
            </div>
            <Button variant="secondary" onClick={() => onToggle(p)}>
              {p.isActive ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {p.isActive ? "Pause" : "Resume"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
