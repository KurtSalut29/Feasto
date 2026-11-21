"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";

type Mode = "admin" | "store";
type Kind = "DEAL" | "VOUCHER";
export type Campaign = { id: string; name: string; startsAt: string; endsAt: string };

/** A date and time box's value in Manila ("2026-12-12T00:00") as an ISO time */
const fromLocal = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : undefined);

/**
 * Making a deal or a voucher. A store makes deals (a price cut on some of its dishes, all day or
 * in a happy hour) and its own vouchers; the admin makes Feasto's vouchers, with a budget and the
 * first-order one. The server checks everything again.
 */
export function PromoForm({
  mode,
  menu = [],
  campaigns = [],
  stores = [],
  onDone,
  onCancel,
}: {
  mode: Mode;
  menu?: { id: string; name: string; price: number }[];
  campaigns?: Campaign[];
  stores?: { id: string; name: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>(mode === "store" ? "DEAL" : "VOUCHER");
  const [f, setF] = useState({
    title: "",
    code: "",
    benefit: "PERCENT_OFF",
    value: "",
    maxDiscount: "",
    minSpend: "",
    startsAt: "",
    endsAt: "",
    dailyFrom: "",
    dailyTo: "",
    perUserLimit: "1",
    totalLimit: "",
    budget: "",
    campaignId: "",
    vendorId: "",
    audience: "EVERYONE",
    isPublic: true,
  });
  const [dishes, setDishes] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const deal = kind === "DEAL";
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      title: f.title,
      benefit: f.benefit,
      value: f.benefit === "FREE_DELIVERY" ? 0 : Number(f.value || 0),
      maxDiscount: num(f.maxDiscount),
      minSpend: Number(f.minSpend || 0),
      startsAt: fromLocal(f.startsAt),
      endsAt: fromLocal(f.endsAt) ?? null,
      dailyFrom: f.dailyFrom || null,
      dailyTo: f.dailyTo || null,
      perUserLimit: Number(f.perUserLimit || 1),
      totalLimit: num(f.totalLimit),
      isPublic: f.isPublic,
      campaignId: f.campaignId || null,
      ...(mode === "store" ? { kind, code: deal ? undefined : f.code, menuItemIds: deal ? dishes : [] } : { code: f.code, vendorId: f.vendorId || null, audience: f.audience, budget: num(f.budget) }),
    };
    const result = await apiRequest(mode === "store" ? "/vendor/promos" : "/admin/promos/vouchers", { method: "POST", body });
    setBusy(false);
    if (!result.ok) return result.fieldErrors ? setErrors(result.fieldErrors) : void toast.error("Couldn't save it", result.error);
    toast.success(deal ? "Deal started" : "Voucher made", deal ? "Residents see the new price on your menu." : `Residents can use ${f.code.toUpperCase()} now.`);
    onDone();
  }

  const err = (k: string) => errors[k]?.[0];
  const benefits = deal
    ? [
        { value: "PERCENT_OFF", label: "Percent off" },
        { value: "AMOUNT_OFF", label: "Pesos off each piece" },
      ]
    : [
        { value: "PERCENT_OFF", label: "Percent off the food" },
        { value: "AMOUNT_OFF", label: "Pesos off the food" },
        { value: "FREE_DELIVERY", label: "Free delivery" },
        { value: "DELIVERY_OFF", label: "Pesos off the delivery" },
      ];

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "store" && (
        <div role="radiogroup" aria-label="Deal or voucher" className="grid grid-cols-2 gap-2">
          {(["DEAL", "VOUCHER"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => (setKind(k), setF((x) => ({ ...x, benefit: "PERCENT_OFF" })))}
              className={`rounded-xl border p-3 text-left text-sm transition ${kind === k ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-line hover:bg-canvas"}`}
            >
              <span className="block font-semibold text-ink">{k === "DEAL" ? "Deal" : "Voucher"}</span>
              <span className="block text-muted">{k === "DEAL" ? "A lower price on some dishes, for everyone" : "A code residents type at checkout"}</span>
            </button>
          ))}
        </div>
      )}
      <TextField label="Name" value={f.title} onChange={set("title")} placeholder={deal ? "Milk tea happy hour: 20% off" : "₱50 off for Christmas"} error={err("title")} />
      {!deal && <TextField label="Code" value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))} placeholder="PASKO50" error={err("code")} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Takes off" placeholder="Choose" options={benefits} value={f.benefit} onChange={set("benefit")} error={err("benefit")} />
        {f.benefit !== "FREE_DELIVERY" && (
          <TextField label={f.benefit === "PERCENT_OFF" ? "Percent" : "Pesos"} type="number" inputMode="decimal" min={0} value={f.value} onChange={set("value")} placeholder={f.benefit === "PERCENT_OFF" ? "15" : "50"} error={err("value")} />
        )}
      </div>
      {(f.benefit === "PERCENT_OFF" || f.benefit === "FREE_DELIVERY") && (
        <TextField label="Most it takes off, in pesos (optional)" type="number" inputMode="decimal" min={0} value={f.maxDiscount} onChange={set("maxDiscount")} placeholder="100" error={err("maxDiscount")} />
      )}

      {deal && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Dishes (none ticked: the whole menu)</legend>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {menu.map((m) => (
              <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-canvas">
                <input type="checkbox" className="size-4 accent-brand-600" checked={dishes.includes(m.id)} onChange={(e) => setDishes((d) => (e.target.checked ? [...d, m.id] : d.filter((x) => x !== m.id)))} />
                <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
                <span className="text-muted tabular-nums">₱{m.price}</span>
              </label>
            ))}
          </div>
          {err("menuItemIds") && <p className="mt-1 text-sm text-red-600">{err("menuItemIds")}</p>}
        </fieldset>
      )}

      {!deal && <TextField label="Minimum spend on food (optional)" type="number" inputMode="decimal" min={0} value={f.minSpend} onChange={set("minSpend")} placeholder="300" error={err("minSpend")} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Starts (optional)" type="datetime-local" value={f.startsAt} onChange={set("startsAt")} hint="Empty: now" error={err("startsAt")} />
        <TextField label="Ends (optional)" type="datetime-local" value={f.endsAt} onChange={set("endsAt")} hint="Empty: until you pause it" error={err("endsAt")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Every day from (optional)" type="time" value={f.dailyFrom} onChange={set("dailyFrom")} hint="A happy hour, like 14:00" error={err("dailyFrom")} />
        <TextField label="Every day until" type="time" value={f.dailyTo} onChange={set("dailyTo")} hint="like 17:00" error={err("dailyTo")} />
      </div>

      {!deal && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Times each resident can use it" type="number" min={1} value={f.perUserLimit} onChange={set("perUserLimit")} error={err("perUserLimit")} />
          <TextField label="Uses in all (optional)" type="number" min={1} value={f.totalLimit} onChange={set("totalLimit")} placeholder="100" error={err("totalLimit")} />
        </div>
      )}

      {mode === "admin" && (
        <>
          <TextField
            label="Feasto's budget for it, in pesos (optional)"
            type="number"
            min={0}
            value={f.budget}
            onChange={set("budget")}
            placeholder="5000"
            hint="It stops working once Feasto has paid this much for it. Cancelled orders give it back."
            error={err("budget")}
          />
          <SelectField
            label="For one store only (optional)"
            placeholder="Every store"
            options={[{ value: "", label: "Every store" }, ...stores.map((s) => ({ value: s.id, label: s.name }))]}
            value={f.vendorId}
            onChange={set("vendorId")}
          />
          <SwitchField
            label="First order only"
            description="For a verified account's first order: once per account, phone number and device."
            checked={f.audience === "FIRST_ORDER"}
            onChange={(v) => setF((x) => ({ ...x, audience: v ? "FIRST_ORDER" : "EVERYONE", perUserLimit: v ? "1" : x.perUserLimit }))}
          />
        </>
      )}

      {campaigns.length > 0 && (
        <SelectField
          label="Part of a sale day (optional)"
          placeholder="No sale day"
          options={[{ value: "", label: "No sale day" }, ...campaigns.map((c) => ({ value: c.id, label: c.name }))]}
          value={f.campaignId}
          onChange={set("campaignId")}
        />
      )}
      {!deal && (
        <SwitchField label="Show in residents' “My vouchers”" description={f.isPublic ? "Everyone sees it." : "Hidden: it works only for those you give the code to."} checked={f.isPublic} onChange={(v) => setF((x) => ({ ...x, isPublic: v }))} />
      )}
      <p className="rounded-xl bg-canvas px-3 py-2 text-sm text-muted">
        {mode === "store" ? "You pay for your deals and vouchers: they come off your food money, and Feasto's commission is on what's left." : "Feasto pays for this voucher: stores still get their full price, and riders their full fee."}
      </p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          {deal ? "Start deal" : "Make voucher"}
        </Button>
      </div>
    </form>
  );
}
