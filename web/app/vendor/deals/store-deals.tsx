"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { PromoForm, type Campaign } from "@/components/app/promo-form";
import { PromoList, type PromoRow } from "@/components/app/promo-list";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/browser-api";
import { BadgePercent } from "lucide-react";

type Data = { promos: PromoRow[]; menu: { id: string; name: string; price: number }[]; campaigns: Campaign[] };

/** The store's deals and vouchers: start one, see how it's doing, pause it */
export function StoreDeals() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Data>("/vendor/promos", reload);
  const [open, setOpen] = useState(false);
  if (!data) return <div className="h-48 animate-pulse rounded-3xl bg-canvas" />;

  async function toggle(p: PromoRow) {
    const result = await apiRequest(`/vendor/promos/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } });
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    toast.success(p.isActive ? "Paused" : "Back on", p.title);
    setReload((n) => n + 1);
  }

  const upcoming = data.campaigns[0];
  return (
    <div className="space-y-4">
      {upcoming && (
        <p className="rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-ink">
          <span className="font-semibold">{upcoming.name}</span> is coming. Join it with a deal: choose it under &ldquo;Part of a sale day&rdquo;, and your deal shows on its banner.
        </p>
      )}
      <section className="rounded-3xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Your deals and vouchers</h2>
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New deal or voucher
          </Button>
        </div>
        {data.promos.length ? (
          <PromoList rows={data.promos} onToggle={toggle} who="store" />
        ) : (
          <div className="mt-3">
            <EmptyState Icon={BadgePercent} title="No deals yet" text="A happy hour on milk tea, 10% off your bestsellers, or ₱30 off for regulars: residents see it on your menu." />
          </div>
        )}
      </section>
      <Dialog open={open} onClose={() => setOpen(false)} title="New deal or voucher" description="You pay for it. The rider's fee is never touched." wide>
        {open && <PromoForm mode="store" menu={data.menu} campaigns={data.campaigns} onCancel={() => setOpen(false)} onDone={() => (setOpen(false), setReload((n) => n + 1))} />}
      </Dialog>
    </div>
  );
}
