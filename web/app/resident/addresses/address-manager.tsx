"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import type { Address } from "@/lib/types";

function AddressDialog({ address, onClose, onSaved }: { address?: Address; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({
    label: address?.label ?? "Home",
    details: address?.details ?? "",
    landmark: address?.landmark ?? "",
    isDefault: address?.isDefault ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = address
      ? await apiRequest(`/me/addresses/${address.id}`, { method: "PATCH", body: values })
      : await apiRequest("/me/addresses", { method: "POST", body: values });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onClose={onClose} title={address ? "Edit address" : "Add an address"}>
      <form onSubmit={save} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label="Name"
          value={values.label}
          onChange={(e) => setValues((v) => ({ ...v, label: e.target.value }))}
          placeholder="Home, Office…"
          error={fieldErrors.label?.[0]}
        />
        <TextField
          label="Address"
          value={values.details}
          onChange={(e) => setValues((v) => ({ ...v, details: e.target.value }))}
          placeholder="House no., street, barangay, city"
          autoComplete="street-address"
          autoFocus
          error={fieldErrors.details?.[0]}
        />
        <TextField
          label="Landmark"
          value={values.landmark}
          onChange={(e) => setValues((v) => ({ ...v, landmark: e.target.value }))}
          placeholder="Optional, e.g. Beside the blue gate"
          error={fieldErrors.landmark?.[0]}
        />
        <SwitchField
          label="Default address"
          description="Used first at checkout."
          checked={values.isDefault}
          onChange={(isDefault) => setValues((v) => ({ ...v, isDefault }))}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save address
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddressManager({ addresses }: { addresses: Address[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  const done = () => {
    setEditing(null);
    router.refresh();
  };

  return (
    <>
      {addresses.length === 0 ? (
        <EmptyState
          Icon={MapPin}
          title="No saved addresses"
          text="Add where you'd like your food delivered."
          action={<Button onClick={() => setEditing("new")}>Add an address</Button>}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {addresses.map((address) => (
              <li key={address.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink">{address.label}</p>
                      {address.isDefault && <Badge tone="brand">Default</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-ink">{address.details}</p>
                    {address.landmark && <p className="text-sm text-muted">{address.landmark}</p>}
                  </div>
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(address)}
                      aria-label={`Edit ${address.label}`}
                      className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/me/addresses/${address.id}`, { method: "DELETE" });
                        router.refresh();
                      }}
                      aria-label={`Delete ${address.label}`}
                      className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setEditing("new")}>
            <Plus className="size-5" aria-hidden />
            Add another address
          </Button>
        </>
      )}
      {editing && <AddressDialog address={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={done} />}
    </>
  );
}
