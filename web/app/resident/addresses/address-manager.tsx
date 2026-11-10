"use client";

import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LocationPicker } from "@/components/map/location-picker";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SwitchField } from "@/components/ui/switch-field";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import { pinOf, type LatLng } from "@/lib/geo";
import type { Address } from "@/lib/types";

function AddressDialog({
  address,
  near,
  onClose,
  onSaved,
}: {
  address?: Address;
  /** Where the map starts for a new address: another saved address */
  near: LatLng | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState({
    label: address?.label ?? "Home",
    details: address?.details ?? "",
    landmark: address?.landmark ?? "",
    isDefault: address?.isDefault ?? false,
  });
  const [pin, setPin] = useState<LatLng | null>(address ? pinOf(address.latitude, address.longitude) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const body = { ...values, ...(pin && { latitude: pin.lat, longitude: pin.lng }) };
    const result = address
      ? await apiRequest(`/me/addresses/${address.id}`, { method: "PATCH", body })
      : await apiRequest("/me/addresses", { method: "POST", body });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    toast.success(address ? "Address updated" : "Address added", address ? undefined : "You can choose it when you check out.");
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
        <LocationPicker
          value={pin}
          onChange={setPin}
          near={near}
          label="Pin for the rider"
          hint="Move the map so the pin is on your door. Riders use it to find you."
          error={fieldErrors.latitude?.[0]}
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

export function AddressManager({ addresses, startAdding = false }: { addresses: Address[]; startAdding?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Address | "new" | null>(startAdding ? "new" : null);

  const done = () => {
    setEditing(null);
    // Drop ?add=1 so a reload doesn't open the form again
    if (startAdding) router.replace("/resident/addresses");
    else router.refresh();
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
                    {address.latitude == null ? (
                      <button type="button" onClick={() => setEditing(address)} className="mt-1 text-xs font-semibold text-amber-700 hover:underline">
                        No map pin yet. Add one so riders find you.
                      </button>
                    ) : (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700">
                        <MapPin className="size-3.5" aria-hidden />
                        Pinned on the map
                      </p>
                    )}
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
                        const result = await apiRequest(`/me/addresses/${address.id}`, { method: "DELETE" });
                        if (!result.ok) return toast.error(`Couldn't delete ${address.label}`, result.error);
                        toast.success(`${address.label} deleted`);
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
      {editing && (
        <AddressDialog
          address={editing === "new" ? undefined : editing}
          near={addresses.map((a) => pinOf(a.latitude, a.longitude)).find(Boolean) ?? null}
          onClose={() => setEditing(null)}
          onSaved={done}
        />
      )}
    </>
  );
}
