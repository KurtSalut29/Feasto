"use client";

import { CircleAlert, Eye, EyeOff, Pencil, Plus, Search, Trash2, UtensilsCrossed, type LucideIcon } from "lucide-react";
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

const lowStock = (item: MenuItem) => item.stock !== null && item.stock <= 5;

function StockLabel({ item }: { item: MenuItem }) {
  if (item.stock === 0) return <Badge tone="danger">Sold out</Badge>;
  if (lowStock(item)) return <Badge tone="warning">{item.stock} left</Badge>;
  if (item.stock !== null) return <span className="text-sm text-muted tabular-nums">{item.stock} in stock</span>;
  return <span className="text-sm text-gray-400">Unlimited</span>;
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
      title={on ? "Shown to residents" : "Hidden from residents"}
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

function Summary({ Icon, label, value, tone }: { Icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span className={`flex size-9 items-center justify-center rounded-xl ring-1 ${tone}`}>
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg leading-tight font-semibold text-ink tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export function MenuManager({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);

  const categories = [...new Set(items.map((i) => i.category))];
  const refresh = () => router.refresh();
  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (i) => (!section || i.category === section) && (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
  );

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Summary Icon={UtensilsCrossed} label="Dishes" value={items.length} tone="bg-brand-50 text-brand-600 ring-brand-100" />
        <Summary Icon={Eye} label="Shown to residents" value={items.filter((i) => i.isAvailable).length} tone="bg-emerald-50 text-emerald-600 ring-emerald-100" />
        <Summary Icon={EyeOff} label="Hidden" value={items.filter((i) => !i.isAvailable).length} tone="bg-canvas text-muted ring-line" />
        <Summary Icon={CircleAlert} label="Low or sold out" value={items.filter(lowStock).length} tone="bg-amber-50 text-amber-600 ring-amber-100" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes"
            aria-label="Search dishes"
            className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </div>
        <div role="group" aria-label="Menu section" className="flex flex-1 flex-wrap gap-1.5">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={section === c}
              onClick={() => setSection(c)}
              className={`h-8 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                section === c ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink"
              }`}
            >
              {c ?? "All sections"}
              <span className={`ml-1.5 text-xs ${section === c ? "text-white/70" : "text-gray-400"}`}>
                {c ? items.filter((i) => i.category === c).length : items.length}
              </span>
            </button>
          ))}
        </div>
        <Button onClick={() => setEditing("new")} className="h-10">
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
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState Icon={Search} title="No dishes found" text={`Nothing matches “${query}”.`} />
        </Card>
      ) : (
        <div className="space-y-6">
          {categories
            .filter((category) => shown.some((i) => i.category === category))
            .map((category) => {
              const dishes = shown.filter((i) => i.category === category);
              return (
                <Card key={category} title={category} description={`${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}`}>
                  <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_90px_84px] gap-4 border-b border-line bg-canvas/60 px-5 py-2 text-[11px] font-semibold tracking-wider text-gray-500 uppercase md:grid">
                    <span>Dish</span>
                    <span className="text-right">Price</span>
                    <span>Stock</span>
                    <span>Available</span>
                    <span className="sr-only">Actions</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {dishes.map((item) => (
                      <li
                        key={item.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-canvas/40 md:grid-cols-[minmax(0,1fr)_110px_120px_90px_84px]"
                      >
                        <div className="flex min-w-0 items-center gap-3.5">
                          <span className={`relative size-14 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line ${item.isAvailable ? "" : "opacity-50 grayscale"}`}>
                            {item.imageUrl ? (
                              <Image src={item.imageUrl} alt="" fill unoptimized className="object-cover" />
                            ) : (
                              <UtensilsCrossed className="absolute inset-0 m-auto size-5 text-gray-300" aria-hidden />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className={`flex items-center gap-2 font-medium ${item.isAvailable ? "text-ink" : "text-muted"}`}>
                              <span className="truncate">{item.name}</span>
                              {!item.isAvailable && <Badge>Hidden</Badge>}
                            </p>
                            {item.description && <p className="truncate text-sm text-muted">{item.description}</p>}
                          </div>
                        </div>
                        <p className="text-right font-semibold text-ink tabular-nums">{formatPeso(item.price)}</p>
                        <div className="hidden md:block">
                          <StockLabel item={item} />
                        </div>
                        <div className="flex">
                          <AvailabilityToggle key={String(item.isAvailable)} item={item} onChanged={refresh} />
                        </div>
                        <div className="flex items-center justify-end gap-1">
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
              );
            })}
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
