"use client";

import { CalendarDays, Plus, Sparkles, TicketPercent } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PromoForm, type Campaign } from "@/components/app/promo-form";
import { PromoList, type PromoRow } from "@/components/app/promo-list";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatDateTime, formatPeso } from "@/lib/format";

type Data = {
  vouchers: PromoRow[];
  campaigns: (Campaign & { tagline: string | null; _count: { promos: number } })[];
  storeDeals: number;
  stores: { id: string; name: string }[];
  totals: { feastoSpent: number; given: number };
};

const card = "rounded-3xl border border-line bg-white p-5";
const local = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16);

/** The next 11.11, 12.12 and paydays (15th and end of month), as one-tap starting points */
function presets() {
  const now = new Date();
  const out: { name: string; tagline: string; start: Date; end: Date }[] = [];
  const day = (y: number, m: number, d: number) => ({ start: new Date(Date.UTC(y, m, d, -8)), end: new Date(Date.UTC(y, m, d + 1, -8)) });
  for (let i = 0; i < 3; i++) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + i;
    const date = new Date(Date.UTC(y, m, 1));
    const yy = date.getUTCFullYear();
    const mm = date.getUTCMonth();
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    if (mm + 1 <= 12) {
      const double = day(yy, mm, mm + 1);
      if (mm + 1 === 11 || mm + 1 === 12) out.push({ name: `${mm + 1}.${mm + 1} Sale`, tagline: "One day only: vouchers from Feasto and deals from your favorite stores", ...double });
    }
    out.push({ name: "Payday Treat", tagline: "Sweldo na! Treat yourself", ...day(yy, mm, 15) });
    out.push({ name: "Payday Treat", tagline: "Sweldo na! Treat yourself", ...day(yy, mm, Math.min(30, last)) });
  }
  return out.filter((p) => p.end > now).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 4);
}

/** Admin › Promos: Feasto's vouchers with their budgets, and the sale days */
export function AdminPromos() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Data>("/admin/promos", reload);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [sale, setSale] = useState<{ name: string; tagline: string; startsAt: string; endsAt: string } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const again = () => setReload((n) => n + 1);
  if (!data) return <div className="h-64 animate-pulse rounded-3xl bg-canvas" />;

  async function toggle(p: PromoRow) {
    const result = await apiRequest(`/admin/promos/vouchers/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } });
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    toast.success(p.isActive ? "Voucher paused" : "Voucher back on", p.code ?? p.title);
    again();
  }

  async function saveSale(event: FormEvent) {
    event.preventDefault();
    if (!sale) return;
    setBusy(true);
    setErrors({});
    const result = await apiRequest("/admin/promos/campaigns", {
      method: "POST",
      body: { name: sale.name, tagline: sale.tagline, startsAt: new Date(`${sale.startsAt}:00+08:00`).toISOString(), endsAt: new Date(`${sale.endsAt}:00+08:00`).toISOString() },
    });
    setBusy(false);
    if (!result.ok) return result.fieldErrors ? setErrors(result.fieldErrors) : void toast.error("Couldn't save it", result.error);
    toast.success("Sale day set", "Make its vouchers next, and choose it under “Part of a sale day”.");
    setSale(null);
    again();
  }

  const now = new Date();
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <p className="text-sm text-muted">Feasto has paid for vouchers</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{formatPeso(data.totals.feastoSpent)}</p>
          <p className="text-xs text-muted">On orders not cancelled</p>
        </div>
        <div className={card}>
          <p className="text-sm text-muted">Taken off by Feasto&apos;s vouchers</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{formatPeso(data.totals.given)}</p>
        </div>
        <div className={card}>
          <p className="text-sm text-muted">Store deals on now</p>
          <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{data.storeDeals}</p>
          <p className="text-xs text-muted">Paid by the stores</p>
        </div>
      </div>

      <section aria-labelledby="sales" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="sales" className="flex items-center gap-2 font-semibold text-ink">
              <Sparkles className="size-5 text-brand-600" aria-hidden />
              Sale days
            </h2>
            <p className="text-sm text-muted">Each shows a banner with a countdown on residents&apos; Home, with its vouchers. Stores can join with their deals.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets().map((p) => (
            <Button key={`${p.name}-${p.start.toISOString()}`} variant="secondary" onClick={() => setSale({ name: p.name, tagline: p.tagline, startsAt: local(p.start), endsAt: local(p.end) })}>
              <Plus className="size-4" aria-hidden />
              {p.name} · {p.start.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" })}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => setSale({ name: "", tagline: "", startsAt: "", endsAt: "" })}>
            <Plus className="size-4" aria-hidden />
            Another sale
          </Button>
        </div>
        {data.campaigns.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {data.campaigns.map((c) => {
              const live = new Date(c.startsAt) <= now && new Date(c.endsAt) > now;
              const over = new Date(c.endsAt) <= now;
              return (
                <li key={c.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${over ? "opacity-60" : ""}`}>
                  <CalendarDays className="size-5 shrink-0 text-brand-600" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">
                      {c.name} {live && <span className="ml-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700">On now</span>}
                    </span>
                    <span className="block text-sm text-muted">
                      {formatDateTime(c.startsAt)} to {formatDateTime(c.endsAt)} · {c._count.promos} {c._count.promos === 1 ? "promo" : "promos"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="vouchers" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="vouchers" className="flex items-center gap-2 font-semibold text-ink">
            <TicketPercent className="size-5 text-brand-600" aria-hidden />
            Feasto&apos;s vouchers
          </h2>
          <Button onClick={() => setVoucherOpen(true)}>
            <Plus className="size-4" aria-hidden />
            New voucher
          </Button>
        </div>
        {data.vouchers.length ? (
          <PromoList rows={data.vouchers} onToggle={toggle} who="admin" />
        ) : (
          <div className="mt-3">
            <EmptyState Icon={TicketPercent} title="No vouchers yet" text="A welcome voucher for first orders, free delivery over ₱300, or a sale-day voucher with a budget." />
          </div>
        )}
      </section>

      <Dialog open={voucherOpen} onClose={() => setVoucherOpen(false)} title="New voucher" description="Feasto pays for it. Stores still get their full price, and riders their full fee." wide>
        {voucherOpen && <PromoForm mode="admin" stores={data.stores} campaigns={data.campaigns.filter((c) => new Date(c.endsAt) > now)} onCancel={() => setVoucherOpen(false)} onDone={() => (setVoucherOpen(false), again())} />}
      </Dialog>
      <Dialog open={sale !== null} onClose={() => setSale(null)} title="Sale day" description="Its banner shows on Home a week before it starts, then counts down to its end.">
        {sale && (
          <form onSubmit={saveSale} className="space-y-3">
            <TextField label="Name" value={sale.name} onChange={(e) => setSale({ ...sale, name: e.target.value })} placeholder="12.12 Sale" error={errors.name?.[0]} />
            <TextField label="Tagline (optional)" value={sale.tagline} onChange={(e) => setSale({ ...sale, tagline: e.target.value })} placeholder="One day only" error={errors.tagline?.[0]} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Starts" type="datetime-local" value={sale.startsAt} onChange={(e) => setSale({ ...sale, startsAt: e.target.value })} error={errors.startsAt?.[0]} />
              <TextField label="Ends" type="datetime-local" value={sale.endsAt} onChange={(e) => setSale({ ...sale, endsAt: e.target.value })} error={errors.endsAt?.[0]} />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setSale(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Set sale day
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
