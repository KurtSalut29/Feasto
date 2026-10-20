"use client";

import { CalendarDays, CircleCheck, Clock, Eye, MapPin, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { storeState } from "@/components/app/store-status";
import { StoreCover } from "@/components/app/store-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageUpload } from "@/components/ui/image-upload";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import { STORE_TYPE_LABEL, STORE_TYPE_OPTIONS } from "@/lib/store-types";
import type { StoreType } from "@/lib/types";

export type StoreSettings = {
  name: string;
  description: string | null;
  address: string;
  storeType: StoreType;
  acceptsReservations: boolean;
  opensAt: string;
  closesAt: string;
  isTemporarilyClosed: boolean;
  imageUrl: string | null;
};

/** Roughly how the store's card looks on the residents' home page, updated as the vendor types. */
function Preview({ values }: { values: StoreSettings }) {
  const { open, label } = storeState(values);
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="relative">
        <StoreCover imageUrl={values.imageUrl} className="aspect-[16/9]" />
        <span
          className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
            open ? "bg-white text-emerald-700" : "bg-white/95 text-gray-700"
          }`}
        >
          <span aria-hidden className={`size-1.5 rounded-full ${open ? "bg-emerald-500" : "bg-gray-400"}`} />
          {open ? "Open" : label.split(" · ")[0]}
        </span>
      </div>
      <div className="p-3.5">
        <p className="truncate font-semibold text-ink">{values.name || "Your store name"}</p>
        <p className="text-xs text-muted">
          {STORE_TYPE_LABEL[values.storeType]} · {formatTime(values.opensAt)} – {formatTime(values.closesAt)}
        </p>
        {values.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{values.description}</p>}
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <MapPin className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="line-clamp-1">{values.address || "Your address"}</span>
        </p>
        {values.acceptsReservations && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-canvas px-1.5 py-0.5 text-xs font-medium text-ink">
            <CalendarDays className="size-3.5" aria-hidden /> Takes bookings
          </span>
        )}
      </div>
    </div>
  );
}

export function StoreForm({ initial }: { initial: StoreSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [savedValues, setSavedValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues);

  function set<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setJustSaved(false);
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const result = await apiRequest("/vendor/store", { method: "PATCH", body: values });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? "Please fix the highlighted fields." : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setSavedValues(values);
    setJustSaved(true);
    router.refresh();
  }

  const err = (k: keyof StoreSettings) => fieldErrors[k]?.[0];

  return (
    <form onSubmit={save} noValidate className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <Card title="Store details" description="What residents see on your store page." Icon={Store}>
          <div className="space-y-4 p-5">
            <ImageUpload label="Cover photo" value={values.imageUrl} onChange={(url) => set("imageUrl", url)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Store name" value={values.name} onChange={(e) => set("name", e.target.value)} error={err("name")} />
              <SelectField
                label="Store type"
                placeholder="Choose the closest match"
                options={STORE_TYPE_OPTIONS}
                value={values.storeType}
                onChange={(e) => set("storeType", e.target.value as StoreType)}
                error={err("storeType")}
              />
            </div>
            <TextareaField
              label="Description"
              value={values.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What makes your food special? e.g. Lutong bahay since 1998."
              maxLength={300}
              error={err("description")}
            />
            <TextField
              label="Address"
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              autoComplete="street-address"
              error={err("address")}
            />
          </div>
        </Card>

        <Card title="Opening hours" description="Philippine time. Residents can only order while you're open." Icon={Clock}>
          <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-start">
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Opens" type="time" value={values.opensAt} onChange={(e) => set("opensAt", e.target.value)} error={err("opensAt")} />
              <TextField label="Closes" type="time" value={values.closesAt} onChange={(e) => set("closesAt", e.target.value)} error={err("closesAt")} />
            </div>
            <div className="md:pt-6">
              <SwitchField
                label="Temporarily closed"
                description="Stop new orders, even during opening hours."
                checked={values.isTemporarilyClosed}
                onChange={(v) => set("isTemporarilyClosed", v)}
              />
            </div>
          </div>
        </Card>

        <Card title="Table reservations" description="Let residents book a table ahead of time." Icon={CalendarDays}>
          <div className="p-5">
            <SwitchField
              label="Accepts table reservations"
              description="Residents can book a table here. Set up your tables under Reservations."
              checked={values.acceptsReservations}
              onChange={(v) => set("acceptsReservations", v)}
            />
          </div>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-8">
        <Card title="Preview" description="Your card on the residents' home page" Icon={Eye}>
          <div className="bg-canvas/60 p-4">
            <Preview values={values} />
          </div>
        </Card>

        <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {error && (
            <div className="mb-3">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
          <p role="status" className="mb-3 flex items-center gap-2 text-sm">
            {dirty ? (
              <>
                <span aria-hidden className="size-2 rounded-full bg-amber-500" />
                <span className="font-medium text-ink">You have unsaved changes</span>
              </>
            ) : justSaved ? (
              <>
                <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                <span className="font-medium text-emerald-700">Saved</span>
              </>
            ) : (
              <span className="text-muted">Everything is up to date.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={!dirty || saving}
              onClick={() => {
                setValues(savedValues);
                setFieldErrors({});
                setError(undefined);
              }}
            >
              Discard
            </Button>
            <Button type="submit" loading={saving} disabled={!dirty} className="flex-1">
              Save changes
            </Button>
          </div>
        </div>
      </aside>
    </form>
  );
}
