"use client";

import { TicketPercent } from "lucide-react";
import { useApiData } from "@/components/app/use-api-data";
import { EmptyState } from "@/components/ui/empty-state";
import { VoucherTicket } from "@/components/app/voucher-ticket";
import { type VoucherCard } from "@/lib/promos";

/** The vouchers to use now, the ones a sale day brings, and the ones already used */
export function VoucherList() {
  const { data } = useApiData<{ vouchers: VoucherCard[] }>("/promos/vouchers");
  if (!data) return <div className="h-48 animate-pulse rounded-2xl bg-canvas" />;
  const given = data.vouchers.filter((v) => v.forYou && !v.problem && !v.upcoming);
  const now = data.vouchers.filter((v) => !v.forYou && !v.problem && !v.upcoming);
  const soon = data.vouchers.filter((v) => v.upcoming);
  const done = data.vouchers.filter((v) => v.problem && !v.upcoming);
  if (!data.vouchers.length) return <EmptyState Icon={TicketPercent} title="No vouchers right now" text="Vouchers for sale days and your first order show up here." />;
  return (
    <div className="space-y-6">
      {given.length > 0 && <Group title="Just for you" list={given} />}
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
          <li key={v.id}>
            <VoucherTicket voucher={v} muted={muted} />
          </li>
        ))}
      </ul>
    </section>
  );
}
