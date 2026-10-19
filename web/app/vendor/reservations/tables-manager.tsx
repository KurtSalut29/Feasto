"use client";

import { Armchair, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { TextField } from "@/components/ui/text-field";
import { apiRequest, type FieldErrors } from "@/lib/api-client";
import type { DiningTable } from "@/lib/types";

function TableDialog({ table, nextLabel, onClose, onSaved }: { table?: DiningTable; nextLabel: string; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(table?.label ?? nextLabel);
  const [seats, setSeats] = useState(String(table?.seats ?? 4));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const body = { label, seats: Number(seats) };
    const result = table
      ? await apiRequest(`/vendor/tables/${table.id}`, { method: "PATCH", body })
      : await apiRequest("/vendor/tables", { method: "POST", body });
    setSaving(false);
    if (!result.ok) {
      setError(result.fieldErrors ? undefined : result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onClose={onClose} title={table ? `Edit ${table.label}` : "Add a table"}>
      <form onSubmit={save} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Table name" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus error={fieldErrors.label?.[0]} />
        <TextField label="Seats" type="number" min="1" max="30" value={seats} onChange={(e) => setSeats(e.target.value)} error={fieldErrors.seats?.[0]} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save table
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function TablesManager({ tables }: { tables: DiningTable[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<DiningTable | "new" | null>(null);
  const [error, setError] = useState<string>();
  const seats = tables.reduce((n, t) => n + t.seats, 0);

  return (
    <Card
      title="Tables"
      description={tables.length ? `${tables.length} tables · ${seats} seats` : "Residents can only book once you add tables."}
      actions={
        <Button className="h-9 px-3 text-sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      }
    >
      {error && (
        <div className="px-5 pt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {tables.length === 0 ? (
        <EmptyState Icon={Armchair} title="No tables yet" text="Add each table with how many people it seats." />
      ) : (
        <ul className="divide-y divide-line">
          {tables.map((table) => (
            <li key={table.id} className="flex items-center gap-3 px-5 py-3">
              <Armchair className="size-5 text-muted" aria-hidden />
              <span className="flex-1 font-medium text-ink">{table.label}</span>
              <span className="text-sm text-muted">{table.seats} seats</span>
              <button type="button" onClick={() => setEditing(table)} aria-label={`Edit ${table.label}`} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink">
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={`Remove ${table.label}`}
                className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600"
                onClick={async () => {
                  setError(undefined);
                  const result = await apiRequest(`/vendor/tables/${table.id}`, { method: "DELETE" });
                  if (!result.ok) return setError(result.error);
                  router.refresh();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TableDialog
          table={editing === "new" ? undefined : editing}
          nextLabel={`Table ${tables.length + 1}`}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
