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
import { apiRequest } from "@/lib/browser-api";
import { toast } from "@/components/ui/toast";
import { formatPeso } from "@/lib/format";
import type { MenuItem } from "@/lib/types";
import { DishDialog } from "./dish-dialog";

const lowStock = (item: MenuItem) => item.stock !== null && item.stock <= 5;

/** The four views of the menu, which double as its summary */
const VIEWS = [
  { key: "all", label: "All dishes", Icon: UtensilsCrossed, tone: "bg-brand-50 text-brand-600 ring-brand-100", test: () => true },
  { key: "shown", label: "On the menu", Icon: Eye, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100", test: (i: MenuItem) => i.isAvailable },
  { key: "hidden", label: "Hidden", Icon: EyeOff, tone: "bg-canvas text-muted ring-line", test: (i: MenuItem) => !i.isAvailable },
  { key: "low", label: "Low or sold out", Icon: CircleAlert, tone: "bg-amber-50 text-amber-600 ring-amber-100", test: lowStock },
] as const satisfies { key: string; label: string; Icon: LucideIcon; tone: string; test: (i: MenuItem) => boolean }[];

type View = (typeof VIEWS)[number]["key"];

function StockLabel({ item }: { item: MenuItem }) {
  if (item.stock === 0) return <Badge tone="danger">Sold out</Badge>;
  if (lowStock(item)) return <Badge tone="warning">{item.stock} left</Badge>;
  if (item.stock !== null) return <span className="text-sm text-muted tabular-nums">{item.stock} in stock</span>;
  return <span className="text-sm text-gray-400">Unlimited</span>;
}

/** On/off switch for whether residents can see and order a dish, with its state in words. */
function AvailabilityToggle({ item, onChanged }: { item: MenuItem; onChanged: () => void }) {
  const [on, setOn] = useState(item.isAvailable);
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Show ${item.name} to residents`}
        disabled={busy}
        onClick={async () => {
          const next = !on;
          setOn(next); // update right away; undo if the server refuses
          setBusy(true);
          const result = await apiRequest(`/vendor/menu/${item.id}`, { method: "PATCH", body: { isAvailable: next } });
          setBusy(false);
          if (!result.ok) {
            setOn(!next);
            toast.error(`Couldn't change ${item.name}`, result.error);
            return;
          }
          if (next) toast.success(`${item.name} is on the menu`, "Residents can order it again.", { duration: 3000 });
          else toast.info(`${item.name} is hidden`, "Residents won't see it until you turn it back on.", { duration: 3500 });
          onChanged();
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
          on ? "bg-emerald-600" : "bg-gray-300"
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition ${on ? "translate-x-5" : ""}`} />
      </button>
      <span aria-hidden className={`text-sm font-medium ${on ? "text-emerald-700" : "text-muted"}`}>
        {on ? "On menu" : "Hidden"}
      </span>
    </label>
  );
}

const EDIT_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink transition hover:border-gray-300 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500";
const DELETE_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-500";

export function MenuManager({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<MenuItem | { section?: string } | null>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");

  const categories = [...new Set(items.map((i) => i.category))];
  const refresh = () => router.refresh();
  const q = query.trim().toLowerCase();
  const test = VIEWS.find((v) => v.key === view)!.test;
  const shown = items.filter(
    (i) => test(i) && (!section || i.category === section) && (!q || i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)),
  );

  return (
    <>
      {/* The summary is also the filter: tap a number to see those dishes */}
      <div role="group" aria-label="Show" className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {VIEWS.map(({ key, label, Icon, tone, test: match }) => {
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setView(active && key !== "all" ? "all" : key)}
              className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                active ? "border-brand-500 ring-2 ring-brand-100" : "border-line hover:border-gray-300"
              }`}
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs text-muted">{label}</span>
                <span className="block text-lg leading-tight font-semibold text-ink tabular-nums">{items.filter(match).length}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 rounded-2xl border border-line bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex sm:items-center sm:gap-3">
        <div className="flex gap-2 sm:contents">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
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
          <Button onClick={() => setEditing({})} className="h-10 shrink-0 px-3.5 sm:order-last sm:px-5">
            <Plus className="size-5" aria-hidden />
            Add dish
          </Button>
        </div>
        <div
          role="group"
          aria-label="Menu section"
          className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:mt-0 sm:flex-1 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={section === c}
              onClick={() => setSection(c)}
              className={`h-8 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
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
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            Icon={UtensilsCrossed}
            title="Your menu is empty"
            text="Add your first dish with its price and photo. Residents see it once your store is approved."
            action={<Button onClick={() => setEditing({})}>Add your first dish</Button>}
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            Icon={Search}
            title="No dishes found"
            text={q ? `Nothing matches “${query}”.` : "No dishes in this view."}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setSection(null);
                  setView("all");
                }}
              >
                Show all dishes
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {categories
            .filter((category) => shown.some((i) => i.category === category))
            .map((category) => {
              const dishes = shown.filter((i) => i.category === category);
              return (
                <Card
                  key={category}
                  title={category}
                  description={`${dishes.length} ${dishes.length === 1 ? "dish" : "dishes"}`}
                  actions={
                    <button
                      type="button"
                      onClick={() => setEditing({ section: category })}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500"
                    >
                      <Plus className="size-4" aria-hidden />
                      Add to {category}
                    </button>
                  }
                >
                  <div className="hidden grid-cols-[minmax(0,1fr)_96px_110px_130px_186px] gap-4 border-b border-line bg-canvas/60 px-5 py-2 text-[11px] font-semibold tracking-wider text-gray-500 uppercase md:grid">
                    <span>Dish</span>
                    <span className="text-right">Price</span>
                    <span>Stock</span>
                    <span>Residents see it</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {dishes.map((item) => (
                      <li
                        key={item.id}
                        className="grid grid-cols-1 items-center gap-x-4 gap-y-3 px-4 py-3.5 transition hover:bg-canvas/40 sm:px-5 md:grid-cols-[minmax(0,1fr)_96px_110px_130px_186px]"
                      >
                        <div className="flex min-w-0 items-center gap-3.5">
                          <span
                            className={`relative size-14 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line ${item.isAvailable ? "" : "opacity-50 grayscale"}`}
                          >
                            {item.imageUrl ? (
                              <Image src={item.imageUrl} alt="" fill unoptimized className="object-cover" />
                            ) : (
                              <UtensilsCrossed className="absolute inset-0 m-auto size-5 text-gray-300" aria-hidden />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className={`truncate font-semibold ${item.isAvailable ? "text-ink" : "text-muted"}`}>{item.name}</p>
                            {item.description && <p className="truncate text-sm text-muted">{item.description}</p>}
                            <p className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                              <span className="font-semibold text-ink tabular-nums">{formatPeso(item.price)}</span>
                              <span aria-hidden className="text-gray-300">
                                ·
                              </span>
                              <StockLabel item={item} />
                            </p>
                          </div>
                        </div>
                        <p className="hidden text-right font-semibold text-ink tabular-nums md:block">{formatPeso(item.price)}</p>
                        <div className="hidden md:block">
                          <StockLabel item={item} />
                        </div>
                        {/* Phones: the switch and both buttons share one row under the dish */}
                        <div className="flex items-center justify-between gap-2 border-t border-dashed border-line pt-3 md:contents md:border-0 md:pt-0">
                          <AvailabilityToggle key={String(item.isAvailable)} item={item} onChanged={refresh} />
                          <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`} className={EDIT_BUTTON}>
                              <Pencil className="size-4" aria-hidden />
                              Edit
                            </button>
                            <button type="button" onClick={() => setDeleting(item)} aria-label={`Delete ${item.name}`} className={DELETE_BUTTON}>
                              <Trash2 className="size-4" aria-hidden />
                              Delete
                            </button>
                          </div>
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
          item={"id" in editing ? editing : undefined}
          section={"id" in editing ? undefined : editing.section}
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
        description="It disappears from your menu. Past orders keep their record of it. To stop selling it for now, switch it to Hidden instead."
      >
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            Keep it
          </Button>
          <Button
            loading={busy}
            className="bg-red-600 hover:bg-red-700"
            onClick={async () => {
              if (!deleting) return;
              setBusy(true);
              const result = await apiRequest(`/vendor/menu/${deleting.id}`, { method: "DELETE" });
              setBusy(false);
              if (!result.ok) return toast.error(`Couldn't delete ${deleting.name}`, result.error);
              toast.success(`${deleting.name} deleted`, "It's no longer on your menu.");
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
