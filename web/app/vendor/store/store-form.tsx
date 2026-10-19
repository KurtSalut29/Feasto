"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ImageUpload } from "@/components/ui/image-upload";
import { SelectField } from "@/components/ui/select-field";
import { SwitchField } from "@/components/ui/switch-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import { STORE_TYPE_OPTIONS } from "@/lib/store-types";
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

export function StoreForm({ initial }: { initial: StoreSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function set<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const result = await apiRequest("/vendor/store", { method: "PATCH", body: values });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const err = (k: keyof StoreSettings) => fieldErrors[k]?.[0];

  return (
    <form onSubmit={save} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card title="Store details" description="This is what residents see on your store page.">
        <div className="space-y-4 p-5">
          {error && <Alert tone="error">{error}</Alert>}
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

      <div className="space-y-6">
        <Card title="Opening hours" description="Philippine time.">
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Opens" type="time" value={values.opensAt} onChange={(e) => set("opensAt", e.target.value)} error={err("opensAt")} />
              <TextField label="Closes" type="time" value={values.closesAt} onChange={(e) => set("closesAt", e.target.value)} error={err("closesAt")} />
            </div>
            <SwitchField
              label="Temporarily closed"
              description="Stop new orders, even during opening hours."
              checked={values.isTemporarilyClosed}
              onChange={(v) => set("isTemporarilyClosed", v)}
            />
          </div>
        </Card>
        <Card title="Table reservations">
          <div className="p-5">
            <SwitchField
              label="Accepts table reservations"
              description="Residents can book a table here."
              checked={values.acceptsReservations}
              onChange={(v) => set("acceptsReservations", v)}
            />
          </div>
        </Card>
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700" role="status">
              <CircleCheck className="size-4" aria-hidden />
              Saved
            </span>
          )}
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}
