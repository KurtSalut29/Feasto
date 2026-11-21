"use client";

import { Clock, Copy, Store, TicketPercent, Truck } from "lucide-react";
import { useApiData } from "@/components/app/use-api-data";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import { benefitWords, isDeliveryVoucher, type VoucherCard } from "@/lib/promos";

/** The vouchers to use now, the ones a sale day brings, and the ones already used */
export function VoucherList() {
  const { data } = useApiData<{ vouchers: VoucherCard[] }>("/promos/vouchers");
  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-canvas" />;
  const now = data.vouchers.filter((v) => !v.problem && !v.upcoming);
  const soon = data.vouchers.filter((v) => v.upcoming);
  const done = data.vouchers.filter((v) => v.problem && !v.upcoming);
  if (!data.vouchers.length) return <EmptyState Icon={TicketPercent} title="No vouchers right now" text="Vouchers for sale days and your first order show up here." />;
  return (
    <div className="space-y-6">
      {now.length > 0 && <Group title="Ready to use" list={now} />}
      {soon.length > 0 && <Group title="Coming on sale days" list={soon} />}
      {done.length > 0 && <Group title="Used or not for you now" list={done} muted />}
    </div>
  );
}

function Group({ title, list, muted = false }: { title: string; list: VoucherCard[]; muted?: boolean }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((v) => (
          <li key={v.id} className={`flex overflow-hidden rounded-2xl border bg-white ${muted ? "border-line opacity-70" : "border-brand-200"}`}>
            <span className={`flex w-14 shrink-0 items-center justify-center ${muted ? "bg-canvas text-gray-500" : "bg-brand-600 text-white"}`}>
              {isDeliveryVoucher(v) ? <Truck className="size-6" aria-hidden /> : <TicketPercent className="size-6" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1 border-l border-dashed border-line p-3">
              <p className="font-bold text-ink">{benefitWords(v)}</p>
              <p className="text-sm text-muted">{v.title}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                {v.minSpend > 0 && <span>Min. spend ₱{v.minSpend.toLocaleString("en-PH")}</span>}
                {v.store && (
                  <span className="inline-flex items-center gap-1">
                    <Store className="size-3" aria-hidden />
                    {v.store.name} only
                  </span>
                )}
                {v.firstOrder && <span>First order, verified ID</span>}
                {v.upcoming ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                    <Clock className="size-3" aria-hidden />
                    Starts {formatDateTime(v.startsAt)}
                  </span>
                ) : (
                  v.endsAt && <span>Until {formatDateTime(v.endsAt)}</span>
                )}
                {v.problem && <span className="font-semibold text-gray-700">{v.problem}</span>}
              </p>
              {v.code && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(v.code!).then(() => toast.success("Code copied", `${v.code}: paste it at checkout.`))}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 font-mono text-sm font-bold tracking-wider text-ink hover:bg-gray-100"
                  aria-label={`Copy the code ${v.code}`}
                >
                  {v.code}
                  <Copy className="size-3.5 text-muted" aria-hidden />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
