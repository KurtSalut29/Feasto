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

/** The store's tables as a small floor plan: seats per table and when each is booked on the chosen day. */
export function TablesManager({
  tables,
  bookedTimes = {},
  dayLabel = "today",
}: {
  tables: DiningTable[];
  bookedTimes?: Record<string, string[]>;
  dayLabel?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<DiningTable | "new" | null>(null);
  const [error, setError] = useState<string>();
  const seats = tables.reduce((n, t) => n + t.seats, 0);

  return (
    <Card
      title="Tables"
      description={tables.length ? `${tables.length} tables · ${seats} seats` : "Residents can only book once you add tables."}
      Icon={Armchair}
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
        <>
          <ul className="grid grid-cols-2 gap-3 p-4">
            {tables.map((table) => {
              const times = bookedTimes[table.label] ?? [];
              return (
                <li
                  key={table.id}
                  className={`group relative rounded-2xl border p-3 transition ${times.length ? "border-brand-100 bg-brand-50/60" : "border-line bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-semibold text-ink">{table.label}</p>
                    <div className="-mt-1 -mr-1 flex">
                      <button
                        type="button"
                        onClick={() => setEditing(table)}
                        aria-label={`Edit ${table.label}`}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${table.label}`}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                        onClick={async () => {
                          setError(undefined);
                          const result = await apiRequest(`/vendor/tables/${table.id}`, { method: "DELETE" });
                          if (!result.ok) return setError(result.error);
                          router.refresh();
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                  {/* One small mark per seat, so the size reads at a glance */}
                  <div className="mt-1.5 flex flex-wrap gap-1" aria-hidden>
                    {Array.from({ length: Math.min(table.seats, 12) }, (_, i) => (
                      <span key={i} className={`size-2 rounded-full ${times.length ? "bg-brand-500/70" : "bg-gray-300"}`} />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{table.seats} seats</p>
                  <p className={`mt-1 text-xs font-medium ${times.length ? "text-brand-700" : "text-emerald-700"}`}>
                    {times.length ? `Booked ${times.join(", ")}` : `Free ${dayLabel}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
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
