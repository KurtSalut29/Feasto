"use client";

import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { apiRequest } from "@/lib/api-client";
import { formatPeso } from "@/lib/format";
import type { MenuItem } from "@/lib/types";
import { DishDialog } from "./dish-dialog";

function StockLabel({ item }: { item: MenuItem }) {
  if (!item.isAvailable) return <Badge>Hidden</Badge>;
  if (item.stock === 0) return <Badge tone="danger">Sold out</Badge>;
  if (item.stock !== null && item.stock <= 5) return <Badge tone="warning">{item.stock} left</Badge>;
  if (item.stock !== null) return <span className="text-sm text-muted">{item.stock} in stock</span>;
  return <span className="text-sm text-muted">Unlimited</span>;
}

/** Inline on/off switch for a dish's availability. */
function AvailabilityToggle({ item, onChanged }: { item: MenuItem; onChanged: () => void }) {
  const [on, setOn] = useState(item.isAvailable);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${item.name} available`}
      disabled={busy}
      onClick={async () => {
        const next = !on;
        setOn(next); // update right away; undo if the server refuses
        setBusy(true);
        const result = await apiRequest(`/vendor/menu/${item.id}`, { method: "PATCH", body: { isAvailable: next } });
        setBusy(false);
        if (!result.ok) setOn(!next);
        else onChanged();
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        on ? "bg-brand-600" : "bg-gray-300"
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

export function MenuManager({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = [...new Set(items.map((i) => i.category))];
  const refresh = () => router.refresh();

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {items.length} {items.length === 1 ? "dish" : "dishes"} in {categories.length}{" "}
          {categories.length === 1 ? "section" : "sections"}
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-5" aria-hidden />
          Add dish
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            Icon={UtensilsCrossed}
            title="Your menu is empty"
            text="Add your first dish with its price and photo. Residents see it once your store is approved."
            action={<Button onClick={() => setEditing("new")}>Add your first dish</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <Card key={category} title={category}>
              <ul className="divide-y divide-line">
                {items
                  .filter((i) => i.category === category)
                  .map((item) => (
                    <li key={item.id} className="flex items-center gap-4 px-5 py-3">
                      <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-canvas">
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt="" fill unoptimized className="object-cover" />
                        ) : (
                          <UtensilsCrossed className="absolute inset-0 m-auto size-5 text-gray-300" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium ${item.isAvailable ? "text-ink" : "text-muted"}`}>{item.name}</p>
                        {item.description && <p className="truncate text-sm text-muted">{item.description}</p>}
                      </div>
                      <p className="w-24 shrink-0 text-right font-semibold text-ink">{formatPeso(item.price)}</p>
                      <div className="hidden w-28 shrink-0 sm:block">
                        <StockLabel item={item} />
                      </div>
                      <AvailabilityToggle key={String(item.isAvailable)} item={item} onChanged={refresh} />
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          aria-label={`Edit ${item.name}`}
                          className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(item)}
                          aria-label={`Delete ${item.name}`}
                          className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-brand-500"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <DishDialog
          open
          item={editing === "new" ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="It disappears from your menu. Past orders keep their record of it."
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (!deleting) return;
              setBusy(true);
              await apiRequest(`/vendor/menu/${deleting.id}`, { method: "DELETE" });
              setBusy(false);
              setDeleting(null);
              refresh();
            }}
          >
            Delete dish
          </Button>
        </div>
      </Dialog>
    </>
  );
}
