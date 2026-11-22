"use client";

import { Ban, Check, Clock, EyeOff, MapPin, Plus, Search, Store, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useApiData } from "@/components/app/use-api-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { timeAgo } from "@/lib/format";
import type { RestrictRule, ShopCategory } from "@/lib/pabili";

type Shop = { id: string; name: string; category: ShopCategory; barangay: string | null; landmark: string; hours: string | null; isActive: boolean; vendorId: string | null; storeName: string | null; pabiliCount: number };
type Suggestion = { id: string; name: string; category: ShopCategory; location: string; createdAt: string; user: { name: string } | null };
type Data = {
  shops: Shop[];
  suggestions: Suggestion[];
  terms: { id: string; term: string; rule: RestrictRule }[];
  liquorBan: boolean;
  categories: Record<ShopCategory, string>;
  stores: { id: string; name: string }[];
};

const RULES: { value: RestrictRule; label: string; about: string; tone: string }[] = [
  { value: "BANNED", label: "Not allowed", about: "The Pabili can't be sent.", tone: "bg-red-100 text-red-800" },
  { value: "PRESCRIPTION", label: "Needs a prescription", about: "Only at a botika, with the prescription's photo.", tone: "bg-sky-100 text-sky-900" },
  { value: "ALCOHOL", label: "Alcohol (18+)", about: "Verified ID, 18 or older; none during a liquor ban.", tone: "bg-amber-100 text-amber-900" },
  { value: "TOBACCO", label: "Cigarettes and vapes (18+)", about: "Verified ID, 18 or older.", tone: "bg-amber-100 text-amber-900" },
  { value: "CHEMICAL", label: "Chemical", about: "Sealed only; the rider is told.", tone: "bg-violet-100 text-violet-900" },
  { value: "LPG", label: "Gas tank", about: "Only if the rider can carry it safely.", tone: "bg-orange-100 text-orange-900" },
  { value: "BULKY", label: "Heavy or long", about: "May not fit on a motorcycle.", tone: "bg-gray-100 text-gray-800" },
];

type ShopForm = { id?: string; suggestionId?: string; name: string; category: ShopCategory | ""; barangay: string; landmark: string; hours: string; vendorId: string; isActive: boolean };
const blankShop: ShopForm = { name: "", category: "", barangay: "", landmark: "", hours: "", vendorId: "", isActive: true };

const card = "rounded-3xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/**
 * Admin › Pabili: the liquor ban, shops residents asked for, the list of Naval shops by kind
 * (residents pick from these instead of typing), and the words that aren't allowed or need
 * something, with a box to try a list against them.
 */
export function PabiliAdmin() {
  const [reload, setReload] = useState(0);
  const { data } = useApiData<Data>("/admin/pabili", reload);
  const again = () => setReload((n) => n + 1);
  const [form, setForm] = useState<ShopForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [term, setTerm] = useState("");
  const [rule, setRule] = useState<RestrictRule | "">("");
  const [termError, setTermError] = useState<string>();
  const [tryText, setTryText] = useState("");

  if (!data) return <div className="h-64 animate-pulse rounded-3xl bg-canvas" />;
  const categoryOptions = (Object.keys(data.categories) as ShopCategory[]).map((c) => ({ value: c, label: data.categories[c] }));

  async function saveShop(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setErrors({});
    const body = { name: form.name, category: form.category, barangay: form.barangay, landmark: form.landmark, hours: form.hours, vendorId: form.vendorId || null, isActive: form.isActive };
    const path = form.suggestionId ? `/admin/pabili/suggestions/${form.suggestionId}/add` : form.id ? `/admin/pabili/shops/${form.id}` : "/admin/pabili/shops";
    const result = await apiRequest(path, { method: form.id ? "PUT" : "POST", body });
    setBusy(false);
    if (!result.ok) return result.fieldErrors ? setErrors(result.fieldErrors) : void toast.error("Couldn't save", result.error);
    toast.success(form.id ? "Shop saved" : "Shop added", form.isActive ? "Residents can choose it in Pabili." : "It's hidden from residents.");
    setForm(null);
    again();
  }

  async function dismiss(id: string) {
    const result = await apiRequest(`/admin/pabili/suggestions/${id}/dismiss`, { method: "POST" });
    if (!result.ok) return void toast.error("Couldn't dismiss it", result.error);
    again();
  }

  async function liquorBan(on: boolean) {
    const result = await apiRequest("/admin/pabili/liquor-ban", { method: "PUT", body: { on } });
    if (!result.ok) return void toast.error("Couldn't change it", result.error);
    toast.success(on ? "Liquor ban on" : "Liquor ban lifted", on ? "Pabili won't buy alcohol until you lift it." : "Adults with a verified ID can ask for alcohol again.");
    again();
  }

  async function addTerm(event: FormEvent) {
    event.preventDefault();
    setTermError(undefined);
    if (!rule) return setTermError("Choose what happens.");
    const result = await apiRequest("/admin/pabili/terms", { method: "POST", body: { term, rule } });
    if (!result.ok) return setTermError(result.fieldErrors?.term?.[0] ?? result.error);
    setTerm("");
    again();
  }

  async function removeTerm(id: string, word: string) {
    const result = await apiRequest(`/admin/pabili/terms/${id}`, { method: "DELETE" });
    if (!result.ok) return void toast.error("Couldn't remove it", result.error);
    toast.info(`“${word}” removed`);
    again();
  }

  const q = filter.trim().toLowerCase();
  const shown = data.shops.filter((s) => !q || `${s.name} ${s.landmark} ${s.barangay ?? ""}`.toLowerCase().includes(q));
  const tried = tryText.trim() ? data.terms.filter((t) => new RegExp(`(^|[^a-z0-9])${t.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(` ${tryText.toLowerCase()} `)) : [];

  return (
    <div className="space-y-5">
      <section aria-label="Liquor ban" className={card}>
        <SwitchField
          label="Liquor ban"
          description={data.liquorBan ? "On: Pabili won't buy alcohol. Lift it when the ban ends." : "Turn on during an election, a typhoon or a local liquor ban: Pabili stops buying alcohol."}
          checked={data.liquorBan}
          onChange={liquorBan}
        />
      </section>

      {data.suggestions.length > 0 && (
        <section aria-labelledby="asked" className={card}>
          <h2 id="asked" className="font-semibold text-ink">
            Shops residents asked for <Badge tone="brand">{data.suggestions.length}</Badge>
          </h2>
          <p className="mt-0.5 text-sm text-muted">Check the name and where it is, then add it so everyone can choose it.</p>
          <ul className="mt-3 divide-y divide-line">
            {data.suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block font-semibold text-ink">{s.name}</span>
                  <span className="block text-sm text-muted">
                    {data.categories[s.category]} · {s.location}
                  </span>
                  <span className="block text-xs text-muted">
                    {s.user ? `${s.user.name}, ` : ""}
                    {timeAgo(s.createdAt)}
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button onClick={() => setForm({ ...blankShop, suggestionId: s.id, name: s.name, category: s.category, landmark: s.location })}>Add</Button>
                  <Button variant="secondary" onClick={() => dismiss(s.id)}>
                    Dismiss
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="shops" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="shops" className="font-semibold text-ink">
              Shops ({data.shops.filter((s) => s.isActive).length})
            </h2>
            <p className="mt-0.5 text-sm text-muted">Residents choose the kind of shop, then one of these. No map: the barangay and a landmark the riders know.</p>
          </div>
          <Button onClick={() => setForm(blankShop)}>
            <Plus className="size-4" aria-hidden />
            Add a shop
          </Button>
        </div>
        <TextField className="mt-3" label="Find a shop" icon={Search} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, landmark or barangay" />
        <ul className="mt-3 divide-y divide-line">
          {shown.map((s) => (
            <li key={s.id} className={`flex flex-wrap items-center gap-3 py-3 ${s.isActive ? "" : "opacity-60"}`}>
              <span className="min-w-0 flex-1 basis-56">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {s.name}
                  <Badge>{data.categories[s.category]}</Badge>
                  {!s.isActive && (
                    <Badge tone="neutral">
                      <EyeOff className="size-3" aria-hidden /> Hidden
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {[s.landmark, s.barangay].filter(Boolean).join(", ")}
                </span>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted">
                  {s.hours && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" aria-hidden />
                      {s.hours}
                    </span>
                  )}
                  {s.storeName && (
                    <span className="inline-flex items-center gap-1">
                      <Store className="size-3" aria-hidden />
                      On Feasto as {s.storeName}
                    </span>
                  )}
                  <span>
                    {s.pabiliCount} Pabili
                  </span>
                </span>
              </span>
              <Button
                variant="secondary"
                onClick={() => setForm({ id: s.id, name: s.name, category: s.category, barangay: s.barangay ?? "", landmark: s.landmark, hours: s.hours ?? "", vendorId: s.vendorId ?? "", isActive: s.isActive })}
              >
                Edit
              </Button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">{q ? "No shop matches." : "No shops yet. Add the shops of Naval residents buy from."}</li>}
        </ul>
      </section>

      <section aria-labelledby="words" className={card}>
        <h2 id="words" className="flex items-center gap-2 font-semibold text-ink">
          <Ban className="size-5 text-red-600" aria-hidden />
          Items that aren&apos;t allowed or need something
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          Words in Filipino or English, checked as residents type their list (whole words: &ldquo;gin&rdquo; doesn&apos;t catch &ldquo;ginger&rdquo;). The rider can also refuse at the shop.
        </p>
        <form onSubmit={addTerm} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
          <TextField label="Word or words" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="emperador" maxLength={40} error={termError} />
          <SelectField label="What happens" placeholder="Choose" options={RULES.map((r) => ({ value: r.value, label: r.label }))} value={rule} onChange={(e) => setRule(e.target.value as RestrictRule)} />
          <Button type="submit" className="sm:mb-0.5">
            Add
          </Button>
        </form>
        <div className="mt-4 space-y-4">
          {RULES.map((r) => {
            const words = data.terms.filter((t) => t.rule === r.value);
            if (!words.length) return null;
            return (
              <div key={r.value}>
                <p className="text-sm font-semibold text-ink">
                  {r.label} <span className="font-normal text-muted">· {r.about}</span>
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {words.map((w) => (
                    <li key={w.id} className={`inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-sm font-medium ${r.tone}`}>
                      {w.term}
                      <button type="button" onClick={() => removeTerm(w.id, w.term)} aria-label={`Remove “${w.term}”`} className="flex size-6 items-center justify-center rounded-full hover:bg-black/10">
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-5 rounded-2xl bg-canvas p-3">
          <TextField label="Try a list" value={tryText} onChange={(e) => setTryText(e.target.value)} placeholder="2 Red Horse, 1 kg bangus, amoxicillin" />
          {tryText.trim() && (
            <p className="mt-2 text-sm text-ink">
              {tried.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Check className="size-4" aria-hidden /> Nothing on it needs anything.
                </span>
              ) : (
                tried.map((t) => `“${t.term}”: ${RULES.find((r) => r.value === t.rule)?.label}`).join(" · ")
              )}
            </p>
          )}
        </div>
      </section>

      <Dialog open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Edit shop" : "Add a shop"} description="What residents and riders see. No map needed.">
        {form && (
          <form onSubmit={saveShop} className="space-y-3">
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Aling Rosa's Sari-sari Store" error={errors.name?.[0]} />
            <SelectField label="Kind of shop" placeholder="Choose" options={categoryOptions} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ShopCategory })} error={errors.category?.[0]} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Barangay (optional)" value={form.barangay} onChange={(e) => setForm({ ...form, barangay: e.target.value })} placeholder="Caraycaray" error={errors.barangay?.[0]} />
              <TextField label="Hours (optional)" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="7 AM to 8 PM" error={errors.hours?.[0]} />
            </div>
            <TextField label="Landmark" value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} placeholder="Across the plaza, beside the bakery" error={errors.landmark?.[0]} />
            <SelectField
              label="The same shop on Feasto (optional)"
              placeholder="Not on Feasto"
              options={[{ value: "", label: "Not on Feasto" }, ...data.stores.map((s) => ({ value: s.id, label: s.name }))]}
              value={form.vendorId}
              onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
            />
            <SwitchField label="Show to residents" description={form.isActive ? "Residents can choose it." : "Hidden: residents can't choose it."} checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                {form.id ? "Save" : "Add shop"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
