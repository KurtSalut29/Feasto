"use client";

import { Handshake, Pencil, Search, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatDate, formatPeso } from "@/lib/format";
import { STORE_TYPE_LABEL, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StoreType } from "@/lib/types";

type Row = {
  id: string;
  name: string;
  storeType: StoreType;
  status: "APPROVED" | "SUSPENDED" | "PENDING";
  imageUrl: string | null;
  commissionPercent: number | null;
  pickupCommissionPercent: number | null;
  commissionNote: string | null;
  commissionSetAt: string | null;
  freeUntil: string | null;
  /** How often it was ready by the time it said, last 30 days */
  onTime: { orders: number; percent: number } | null;
};
type Template = { name: string; delivery: number; pickup: number };
type Data = { defaults: { delivery: number; pickup: number }; templates: Template[]; stores: Row[] };

const DEFAULT = "Default";
const CUSTOM = "Custom";
const hasOwn = (r: Row) => r.commissionPercent !== null || r.pickupCommissionPercent !== null;

/**
 * The commission agreed with each store, like the rates big chains and small eateries get on other
 * food apps. A store without its own rate pays the default in Settings. Orders keep the rate they
 * were placed with, so changing an agreement never changes past reports.
 */
export function StoreCommissions() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Data>("/admin/store-commissions", reload);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [which, setWhich] = useState<"" | "own" | "default">("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<Row[] | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.stores ?? []).filter(
      (r) => (!q || r.name.toLowerCase().includes(q)) && (!type || r.storeType === type) && (!which || (which === "own") === hasOwn(r)),
    );
  }, [data, query, type, which]);
  const pickedRows = (data?.stores ?? []).filter((r) => picked.includes(r.id));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.includes(r.id));
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const rateWords = (r: Row) => {
    const d = data!.defaults;
    return `${r.commissionPercent ?? d.delivery}% delivery · ${r.pickupCommissionPercent ?? d.pickup}% pickup`;
  };

  return (
    <Card
      title="Store commissions"
      Icon={Handshake}
      description="The rate agreed with each store. A big chain and a small karinderya can pay differently; stores without their own rate pay the default in Feasto's earnings below."
    >
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Search stores</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores"
              className="h-11 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none transition placeholder:text-gray-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
          </label>
          <SelectField label="Kind of store" placeholder="Every kind" className="[&>label]:sr-only" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: "", label: "Every kind" }, ...STORE_TYPE_OPTIONS]} />
          <SelectField
            label="Rate"
            placeholder="Every rate"
            className="[&>label]:sr-only"
            value={which}
            onChange={(e) => setWhich(e.target.value as typeof which)}
            options={[
              { value: "", label: "Every rate" },
              { value: "own", label: "Own rate" },
              { value: "default", label: "Default rate" },
            ]}
          />
        </div>

        {/* What happens to the stores ticked below */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2.5">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4 accent-brand-600"
              checked={allShownPicked}
              onChange={() => setPicked(allShownPicked ? picked.filter((id) => !shown.some((r) => r.id === id)) : [...new Set([...picked, ...shown.map((r) => r.id)])])}
              disabled={shown.length === 0}
            />
            {picked.length ? `${picked.length} store${picked.length === 1 ? "" : "s"} ticked` : `Tick stores to set one rate for all of them`}
          </label>
          <Button className="h-9 px-3 text-sm" disabled={picked.length === 0} onClick={() => setEditing(pickedRows)}>
            Set their rate
          </Button>
        </div>

        {!data ? (
          <p className="py-6 text-center text-sm text-muted">Loading stores…</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No store matches. Clear the search or the filters.</p>
        ) : (
          <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <input type="checkbox" className="size-4 shrink-0 accent-brand-600" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Tick ${r.name}`} />
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-canvas text-gray-500">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.imageUrl ? <img src={r.imageUrl} alt="" className="size-full object-cover" /> : <Store className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium text-ink">{r.name}</span>
                    {hasOwn(r) ? <Badge tone="brand">Own rate</Badge> : <Badge>Default</Badge>}
                    {r.freeUntil && <Badge tone="success">Free until {formatDate(r.freeUntil)}</Badge>}
                    {r.status !== "APPROVED" && <Badge tone="warning">{r.status === "PENDING" ? "Not approved yet" : "Suspended"}</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {STORE_TYPE_LABEL[r.storeType]} · <span className="text-ink tabular-nums">{rateWords(r)}</span>
                    {r.commissionNote ? ` · ${r.commissionNote}` : ""}
                    {r.commissionSetAt ? ` · since ${formatDate(r.commissionSetAt)}` : ""}
                  </p>
                  {r.onTime && (
                    <p className={`text-xs ${r.onTime.percent >= 85 ? "text-emerald-700" : r.onTime.percent >= 60 ? "text-amber-800" : "text-red-700"}`}>
                      Ready on time {r.onTime.percent}% of {r.onTime.orders} order{r.onTime.orders === 1 ? "" : "s"} (last 30 days)
                    </p>
                  )}
                </div>
                <Button variant="secondary" className="h-9 shrink-0 px-3 text-sm" onClick={() => setEditing([r])} aria-label={`Change ${r.name}'s rate`}>
                  <Pencil className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Change</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">New orders use the new rate. Orders already placed keep theirs, so past reports stay right. Each change is in the activity log, and the store sees its rate in Reports.</p>
      </div>

      {editing && data && (
        <RateDialog
          stores={editing}
          data={data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setPicked([]);
            setReload((n) => n + 1);
          }}
        />
      )}
    </Card>
  );
}

function RateDialog({ stores, data, onClose, onSaved }: { stores: Row[]; data: Data; onClose: () => void; onSaved: () => void }) {
  const one = stores.length === 1 ? stores[0]! : null;
  const startTemplate = () => {
    if (!one || !hasOwn(one)) return DEFAULT;
    return data.templates.find((t) => t.delivery === one.commissionPercent && t.pickup === one.pickupCommissionPercent)?.name ?? CUSTOM;
  };
  const [template, setTemplate] = useState(startTemplate);
  const [delivery, setDelivery] = useState(String(one?.commissionPercent ?? data.defaults.delivery));
  const [pickup, setPickup] = useState(String(one?.pickupCommissionPercent ?? data.defaults.pickup));
  const [note, setNote] = useState(one?.commissionNote ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  function choose(name: string) {
    setTemplate(name);
    setErrors({});
    const t = data.templates.find((x) => x.name === name);
    if (t) {
      setDelivery(String(t.delivery));
      setPickup(String(t.pickup));
    } else if (name === DEFAULT) {
      setDelivery(String(data.defaults.delivery));
      setPickup(String(data.defaults.pickup));
    }
  }

  async function save() {
    setSaving(true);
    setErrors({});
    const own = template !== DEFAULT;
    const number = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
    const result = await apiRequest("/admin/store-commissions", {
      method: "PUT",
      body: {
        vendorIds: stores.map((s) => s.id),
        commissionPercent: own ? number(delivery) : null,
        pickupCommissionPercent: own ? number(pickup) : null,
        note: own ? note : "",
      },
    });
    setSaving(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      else toast.error("Couldn't save the rate", result.error);
      return;
    }
    toast.success(one ? `${one.name}'s rate saved` : `Rate saved for ${stores.length} stores`, "New orders use it from now on.");
    onSaved();
  }

  const d = Number(delivery) || 0;
  const options = [...data.templates.map((t) => ({ name: t.name, words: `${t.delivery}% · ${t.pickup}% pickup` })), { name: CUSTOM, words: "Type the agreed rate" }, { name: DEFAULT, words: `${data.defaults.delivery}% · ${data.defaults.pickup}% pickup` }];

  return (
    <Dialog
      open
      onClose={onClose}
      title={one ? `${one.name}'s commission` : `Commission for ${stores.length} stores`}
      description={one ? "The rate you agreed with this store. Orders already placed keep theirs." : stores.map((s) => s.name).join(", ")}
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Kind of agreement</legend>
          <div className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <label
                key={o.name}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 transition-colors has-focus-visible:ring-4 has-focus-visible:ring-brand-500/20 ${template === o.name ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:bg-canvas"}`}
              >
                <input type="radio" name="template" value={o.name} checked={template === o.name} onChange={() => choose(o.name)} className="sr-only" />
                <span className="block text-sm font-semibold text-ink">{o.name === DEFAULT ? "Use the default" : o.name}</span>
                <span className="block text-xs text-muted">{o.words}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {template !== DEFAULT && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Delivery (%)"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={delivery}
                onChange={(e) => {
                  setTemplate(CUSTOM);
                  setDelivery(e.target.value);
                }}
                error={errors.commissionPercent?.[0]}
              />
              <TextField
                label="Pickup (%)"
                type="number"
                inputMode="decimal"
                step="0.5"
                min="0"
                value={pickup}
                onChange={(e) => {
                  setTemplate(CUSTOM);
                  setPickup(e.target.value);
                }}
                error={errors.pickupCommissionPercent?.[0]}
              />
            </div>
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Signed Nov 25, reviewed every 6 months" error={errors.note?.[0]} />
          </>
        )}

        <p className="rounded-xl bg-canvas px-3 py-2.5 text-sm text-ink">
          On {formatPeso(1000)} of food delivered: Feasto keeps <b className="tabular-nums">{formatPeso((1000 * d) / 100)}</b>, the store gets{" "}
          <b className="tabular-nums">{formatPeso(1000 - (1000 * d) / 100)}</b>. A store in its free first month still pays nothing until it ends.
        </p>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={saving} onClick={save}>
            Save rate
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
