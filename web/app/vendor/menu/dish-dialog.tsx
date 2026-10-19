"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ImageUpload } from "@/components/ui/image-upload";
import { SwitchField } from "@/components/ui/switch-field";
import { TextareaField } from "@/components/ui/textarea-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import type { MenuItem } from "@/lib/types";

type Values = {
  name: string;
  category: string;
  description: string;
  price: string;
  stock: string;
  imageUrl: string | null;
  isAvailable: boolean;
};

const toValues = (item?: MenuItem): Values => ({
  name: item?.name ?? "",
  category: item?.category ?? "",
  description: item?.description ?? "",
  price: item ? String(Number(item.price)) : "",
  stock: item?.stock === null || item?.stock === undefined ? "" : String(item.stock),
  imageUrl: item?.imageUrl ?? null,
  isAvailable: item?.isAvailable ?? true,
});

/** Add or edit one dish. */
export function DishDialog({
  open,
  item,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  item?: MenuItem;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState(() => toValues(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const body = { ...values, price: values.price === "" ? undefined : Number(values.price) };
    const result = item
      ? await apiRequest(`/vendor/menu/${item.id}`, { method: "PATCH", body })
      : await apiRequest("/vendor/menu", { method: "POST", body });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onSaved();
  }

  const err = (k: keyof Values) => fieldErrors[k]?.[0];

  return (
    <Dialog open={open} onClose={onClose} title={item ? `Edit ${item.name}` : "Add a dish"} wide>
      <form onSubmit={save} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <ImageUpload label="Photo" shape="square" value={values.imageUrl} onChange={(url) => set("imageUrl", url)} />
          <div className="space-y-4">
            <TextField label="Dish name" value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Chicken Adobo" autoFocus error={err("name")} />
            <TextField
              label="Menu section"
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Rice Meals"
              list="menu-sections"
              error={err("category")}
            />
            <datalist id="menu-sections">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <TextField
            label="Price (₱)"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="120"
            error={err("price")}
          />
          <TextField
            label="Stock"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={values.stock}
            onChange={(e) => set("stock", e.target.value)}
            placeholder="Unlimited"
            hint="Leave blank if it never runs out."
            error={err("stock")}
          />
        </div>
        <TextareaField
          label="Description"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Optional, e.g. Served with rice and egg."
          maxLength={200}
          rows={2}
          error={err("description")}
        />
        <SwitchField
          label="Available"
          description="Turn off to hide it from orders for now."
          checked={values.isAvailable}
          onChange={(v) => set("isAvailable", v)}
        />
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {item ? "Save changes" : "Add dish"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
