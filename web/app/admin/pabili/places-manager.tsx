"use client";

import { Eye, EyeOff, Lightbulb, MapPin, Pencil, Plus, ShoppingBasket, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker } from "@/components/map/location-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import type { LatLng } from "@/lib/geo";
import { PLACE_KIND, type PlaceKind } from "../../resident/pabili/errand";

export type AdminPlace = { id: string; name: string; kind: PlaceKind; address: string; latitude: number; longitude: number; isActive: boolean; errands: number };
export type Suggestion = { name: string; address: string; latitude: number; longitude: number; times: number; corrected: number };

type Draft = { id?: string; name: string; kind: PlaceKind | ""; address: string; pin: LatLng | null };

const KIND_OPTIONS = (Object.keys(PLACE_KIND) as PlaceKind[]).map((k) => ({ value: k, label: PLACE_KIND[k] }));
const pill =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50";

/** The list of Pabili places, adding and editing them, and shops residents keep typing in */
export function PlacesManager({ places, suggestions, suggestDays }: { places: AdminPlace[]; suggestions: Suggestion[]; suggestDays: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [toggling, setToggling] = useState<string | null>(null);

  const open = (d: Draft) => {
    setErrors({});
    setDraft(d);
  };

  async function save() {
    if (!draft) return;
    setSaving(true);
    const body = { name: draft.name, kind: draft.kind || undefined, address: draft.address, latitude: draft.pin?.lat, longitude: draft.pin?.lng };
    const result = await apiRequest(draft.id ? `/admin/pabili-places/${draft.id}` : "/admin/pabili-places", { method: draft.id ? "PATCH" : "POST", body });
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      if (!result.fieldErrors) toast.error("Couldn't save the place", result.error);
      return;
    }
    toast.success(draft.id ? "Place saved" : "Place added", draft.id ? undefined : `${draft.name} is on the Pabili list now.`);
    setDraft(null);
    router.refresh();
  }

  async function toggle(p: AdminPlace) {
    setToggling(p.id);
    const result = await apiRequest(`/admin/pabili-places/${p.id}`, { method: "PATCH", body: { isActive: !p.isActive } });
    setToggling(null);
    if (!result.ok) return toast.error("Couldn't change the place", result.error);
    toast.success(p.isActive ? "Hidden from residents" : "Shown to residents again", p.name);
    router.refresh();
  }

  const err = (k: string) => errors[k]?.[0];
  return (
    <div className="space-y-5">
      <Card
        title="On the list"
        description={`${places.filter((p) => p.isActive).length} shown to residents`}
        Icon={ShoppingBasket}
        actions={
          <Button onClick={() => open({ name: "", kind: "", address: "", pin: null })}>
            <Plus className="size-4" aria-hidden />
            Add a place
          </Button>
        }
      >
        {places.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No places yet. Add the market, the drugstores and the shops residents ask for most.</p>
        ) : (
          <ul className="divide-y divide-line">
            {places.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Store className={`size-5 shrink-0 ${p.isActive ? "text-brand-600" : "text-gray-400"}`} aria-hidden />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {p.name}
                    {!p.isActive && <Badge tone="neutral">Hidden</Badge>}
                  </p>
                  <p className="text-sm text-muted">
                    {PLACE_KIND[p.kind]} · {p.address} · {p.errands} Pabili
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={pill} onClick={() => open({ id: p.id, name: p.name, kind: p.kind, address: p.address, pin: { lat: p.latitude, lng: p.longitude } })}>
                    <Pencil className="size-4" aria-hidden />
                    Edit
                  </button>
                  <button type="button" className={pill} disabled={toggling === p.id} onClick={() => toggle(p)} aria-label={`${p.isActive ? "Hide" : "Show"} ${p.name}`}>
                    {p.isActive ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    {p.isActive ? "Hide" : "Show"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {suggestions.length > 0 && (
        <Card title="Shops residents typed in" description={`Bought in the last ${suggestDays} days but not on the list. The pin is where the rider bought.`} Icon={Lightbulb} accent="amber">
          <ul className="divide-y divide-line">
            {suggestions.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <MapPin className="size-5 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold text-ink">{s.name}</p>
                  <p className="text-sm text-muted">
                    {s.address} · {s.times} Pabili{s.corrected > 0 && ` · the pin was off ${s.corrected}×`}
                  </p>
                </div>
                <button type="button" className={pill} onClick={() => open({ name: s.name, kind: "", address: s.address, pin: { lat: s.latitude, lng: s.longitude } })}>
                  <Plus className="size-4" aria-hidden />
                  Add to the list
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={draft !== null} onClose={() => setDraft(null)} title={draft?.id ? "Edit the place" : "Add a Pabili place"} description="Check the pin carefully: it sets the delivery fee and the rider's directions.">
        {draft && (
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <TextField label="Name" icon={Store} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Naval Public Market" required error={err("name")} />
            <SelectField
              label="Kind of shop"
              placeholder="Choose one"
              options={KIND_OPTIONS}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as PlaceKind })}
              required
              error={err("kind")}
            />
            <TextField label="Where it is" icon={MapPin} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="Street, barangay or a landmark" required error={err("address")} />
            <LocationPicker value={draft.pin} onChange={(pin) => setDraft({ ...draft, pin })} label="The shop on the map" required error={err("latitude") ?? err("longitude")} />
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {draft.id ? "Save" : "Add the place"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
