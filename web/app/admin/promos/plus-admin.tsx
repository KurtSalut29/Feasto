"use client";

import { Crown } from "lucide-react";
import { useApiData } from "@/components/app/use-api-data";
import { formatPeso } from "@/lib/format";

type Stats = { members: number; months: number; income: number; freeDeliveries: number; freeDeliveryCost: number };

/** Admin › Promos › Feasto Plus: members now, money in, and what the free deliveries cost */
export function PlusAdmin() {
  const { data } = useApiData<Stats>("/admin/plus");
  if (!data) return <div className="h-32 animate-pulse rounded-3xl bg-canvas" />;
  return (
    <section aria-labelledby="plus" className="rounded-3xl border border-line bg-white p-5">
      <h2 id="plus" className="flex items-center gap-2 font-semibold text-ink">
        <Crown className="size-5 text-amber-600" aria-hidden />
        Feasto Plus
      </h2>
      <p className="text-sm text-muted">Monthly members with free deliveries. Price and perks are in Admin › Settings; members-only vouchers are made with &ldquo;New voucher&rdquo;.</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-canvas p-3">
          <dt className="text-sm text-muted">Members now</dt>
          <dd className="text-xl font-bold text-ink tabular-nums">{data.members}</dd>
        </div>
        <div className="rounded-2xl bg-canvas p-3">
          <dt className="text-sm text-muted">Paid in</dt>
          <dd className="text-xl font-bold text-ink tabular-nums">{formatPeso(data.income)}</dd>
          <dd className="text-xs text-muted">{data.months} months in all</dd>
        </div>
        <div className="rounded-2xl bg-canvas p-3">
          <dt className="text-sm text-muted">Free deliveries given</dt>
          <dd className="text-xl font-bold text-ink tabular-nums">{formatPeso(data.freeDeliveryCost)}</dd>
          <dd className="text-xs text-muted">{data.freeDeliveries} orders, paid by Feasto</dd>
        </div>
      </dl>
    </section>
  );
}
