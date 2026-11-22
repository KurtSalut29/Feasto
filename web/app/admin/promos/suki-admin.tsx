"use client";

import { Coins, Pause, Play, Plus, Target } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";

type Mission = { id: string; title: string; kind: "ORDERS" | "NEW_STORES" | "SPEND"; target: number; period: "WEEK" | "MONTH"; rewardPoints: number; isActive: boolean };
type Data = {
  on: boolean;
  pointValue: number;
  missions: Mission[];
  totals: { earned: number; given: number; byReason: Record<string, { points: number; count: number }>; spent: number; spentPesos: number; outstanding: number; outstandingPesos: number };
};

const KIND: Record<Mission["kind"], string> = { ORDERS: "Orders delivered", NEW_STORES: "New stores tried", SPEND: "Pesos of food" };
const PERIOD: Record<Mission["period"], string> = { WEEK: "each week", MONTH: "each month" };
const card = "rounded-3xl border border-line bg-white p-5";
const num = (n: number) => n.toLocaleString("en-PH");

/** Admin › Promos › Suki: what points cost Feasto, and the missions */
export function SukiAdmin() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Data>("/admin/loyalty", reload);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", kind: "", target: "", period: "", rewardPoints: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-canvas" />;
  const again = () => setReload((n) => n + 1);

  async function toggle(m: Mission) {
    const result = await apiRequest(`/admin/loyalty/missions/${m.id}`, { method: "PATCH", body: { isActive: !m.isActive } });
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    toast.success(m.isActive ? "Mission paused" : "Mission back on", m.title);
    again();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    const result = await apiRequest("/admin/loyalty/missions", { method: "POST", body: { title: form.title, kind: form.kind || null, target: n(form.target), period: form.period || null, rewardPoints: n(form.rewardPoints) } });
    setBusy(false);
    if (!result.ok) return result.fieldErrors ? setErrors(result.fieldErrors) : void toast.error("Couldn't save it", result.error);
    toast.success("Mission started", "Residents see it on their Suki page now.");
    setOpen(false);
    setForm({ title: "", kind: "", target: "", period: "", rewardPoints: "" });
    again();
  }

  const t = data.totals;
  return (
    <section aria-labelledby="suki" className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="suki" className="flex items-center gap-2 font-semibold text-ink">
            <Coins className="size-5 text-brand-600" aria-hidden />
            Suki points {!data.on && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-bold text-gray-700">Off</span>}
          </h2>
          <p className="text-sm text-muted">Points on delivered orders, missions, friends and birthdays. Feasto pays when they&apos;re used. Rates are in Admin › Settings.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden />
          New mission
        </Button>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-canvas p-3">
          <dt className="text-sm text-muted">Used at checkout</dt>
          <dd className="text-xl font-bold text-ink tabular-nums">{formatPeso(t.spentPesos)}</dd>
          <dd className="text-xs text-muted">{num(t.spent)} points, on orders not cancelled</dd>
        </div>
        <div className="rounded-2xl bg-canvas p-3">
          <dt className="text-sm text-muted">Not used yet</dt>
          <dd className="text-xl font-bold text-ink tabular-nums">{formatPeso(t.outstandingPesos)}</dd>
          <dd className="text-xs text-muted">{num(t.outstanding)} points residents hold</dd>
        </div>
        <div className="rounded-2xl bg-canvas p-3">
          <dt className="text-sm text-muted">Given</dt>
          <dd className="text-xl font-bold text-ink tabular-nums">{num(t.earned + t.given)}</dd>
          <dd className="text-xs text-muted">
            {num(t.earned)} from orders · {num(t.byReason.MISSION?.points ?? 0)} missions · {num(t.byReason.REFERRAL?.points ?? 0)} friends · {num(t.byReason.BIRTHDAY?.points ?? 0)} birthdays
          </dd>
        </div>
      </dl>
      <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold text-ink">
        <Target className="size-4 text-brand-600" aria-hidden />
        Missions
      </h3>
      {data.missions.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No missions yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {data.missions.map((m) => (
            <li key={m.id} className={`flex flex-wrap items-center gap-3 py-2.5 ${m.isActive ? "" : "opacity-60"}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-ink">{m.title}</span>
                <span className="block text-sm text-muted">
                  {KIND[m.kind]}: {m.kind === "SPEND" ? formatPeso(m.target) : m.target} {PERIOD[m.period]} · +{num(m.rewardPoints)} points ({formatPeso(m.rewardPoints * data.pointValue)})
                </span>
              </span>
              <Button variant="secondary" onClick={() => toggle(m)}>
                {m.isActive ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                {m.isActive ? "Pause" : "Resume"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="New mission" description="Counted from orders that arrive. Done once per week or month; the points come by themselves.">
        <form onSubmit={save} className="space-y-3">
          <TextField label="Name" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Order 3 times this week" error={errors.title?.[0]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="What's counted"
              placeholder="Choose"
              options={[
                { value: "ORDERS", label: "Orders delivered" },
                { value: "NEW_STORES", label: "New stores tried" },
                { value: "SPEND", label: "Pesos of food" },
              ]}
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              error={errors.kind?.[0]}
            />
            <TextField label={form.kind === "SPEND" ? "Pesos" : "How many"} type="number" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} error={errors.target?.[0]} />
            <SelectField
              label="Every"
              placeholder="Choose"
              options={[
                { value: "WEEK", label: "Week (from Monday)" },
                { value: "MONTH", label: "Month" },
              ]}
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
              error={errors.period?.[0]}
            />
            <TextField
              label="Points"
              type="number"
              inputMode="numeric"
              value={form.rewardPoints}
              onChange={(e) => setForm({ ...form, rewardPoints: e.target.value })}
              hint={form.rewardPoints ? `Worth ${formatPeso(Number(form.rewardPoints) * data.pointValue)}` : undefined}
              error={errors.rewardPoints?.[0]}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Start mission
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
