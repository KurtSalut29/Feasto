"use client";

import { ChevronRight, Flame, LoaderCircle, Minus, Plus, Search, SearchX, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DishPhoto } from "@/components/app/dish-photo";
import { apiRequest } from "@/lib/api-client";
import { formatPeso } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const isSoldOut = (item: MenuItem) => !item.isAvailable || item.stock === 0;
/** Popular only means something on a menu big enough to choose from, with real orders behind it */
const POPULAR_FROM_MENU_SIZE = 5;
const POPULAR_SIZE = 4;
/** Below this, the whole menu fits on a screen or two and a search box is just clutter */
const SEARCH_FROM_MENU_SIZE = 6;
const dishes = (n: number) => `${n} ${n === 1 ? "dish" : "dishes"}`;

type Ordering = { canOrder: boolean; closedText: string };

/**
 * The menu, one section at a time: the tabs work like the store's own menu pages, so Mains
 * never runs into Desserts. Each dish is a photo card; tapping it opens it in full (big photo,
 * the whole description, how many) and the round + adds one straight away. Search looks
 * through every section. The cart bar at the bottom follows every change.
 */
export function StoreMenu({
  storeName,
  otherStores,
  items,
  quantities: initial,
  ordering,
}: {
  storeName: string;
  /** Other stores already in the cart, so the bar can say so */
  otherStores: number;
  items: MenuItem[];
  quantities: Record<string, number>;
  ordering: Ordering;
}) {
  const router = useRouter();
  const [quantities, setQuantities] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string>();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const menuTop = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const popular = useMemo(() => {
    const ranked = items.filter((i) => !isSoldOut(i) && (i.soldCount ?? 0) > 0).sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0));
    // At most half the menu, or "popular" would just repeat the menu
    return items.length >= POPULAR_FROM_MENU_SIZE && ranked.length >= 2 ? ranked.slice(0, Math.min(POPULAR_SIZE, Math.floor(items.length / 2))) : [];
  }, [items]);
  const popularIds = new Set(popular.map((i) => i.id));
  const tabs = [
    ...(popular.length ? [{ id: "menu-popular", label: "Popular", count: popular.length }] : []),
    ...sections.map((s) => ({ id: `menu-${slug(s)}`, label: s, count: items.filter((i) => i.category === s).length })),
  ];
  const [shown, setShown] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === shown) ?? tabs[0];
  const shownItems = !current ? [] : current.id === "menu-popular" ? popular : items.filter((i) => `menu-${slug(i.category)}` === current.id);

  function showSection(id: string) {
    setShown(id);
    // Switching after scrolling down starts the new section at its top, under the tabs
    const top = menuTop.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) menuTop.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }

  const needle = query.trim().toLowerCase();
  const found = needle
    ? items.filter((i) => [i.name, i.description ?? "", i.category].some((text) => text.toLowerCase().includes(needle)))
    : [];

  // A message stays a few seconds, then gets out of the way
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(undefined), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  async function setQuantity(item: MenuItem, next: number) {
    const previous = quantities[item.id] ?? 0;
    setQuantities((q) => ({ ...q, [item.id]: next }));
    setBusy(item.id);
    setMessage(undefined);
    const result = await apiRequest("/cart/items", { method: "PUT", body: { menuItemId: item.id, quantity: next } });
    setBusy(null);
    if (!result.ok) {
      setQuantities((q) => ({ ...q, [item.id]: previous }));
      setMessage(result.error);
      return false;
    }
    router.refresh(); // the cart badge in the top bar
    return true;
  }

  const count = items.reduce((n, i) => n + (quantities[i.id] ?? 0), 0);
  const subtotal = items.reduce((sum, i) => sum + (quantities[i.id] ?? 0) * Number(i.price), 0);
  const opened = items.find((i) => i.id === openId);
  const add = { quantities, busy, ordering, onOpen: setOpenId, onAdd: (item: MenuItem) => setQuantity(item, (quantities[item.id] ?? 0) + 1) };

  // One box around the menu, so its tabs stop sticking where the menu ends
  return (
    <div>
      <div ref={menuTop} className="mt-8 flex scroll-mt-20 items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-ink">Menu</h2>
        <p className="text-sm text-muted">{dishes(items.length)}</p>
      </div>

      {items.length >= SEARCH_FROM_MENU_SIZE && (
        <div role="search" className="relative mt-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={40}
            placeholder={`Search ${storeName}'s menu`}
            aria-label="Search the menu"
            className="h-11 w-full rounded-xl border border-line bg-canvas pr-11 pl-11 text-[15px] outline-none placeholder:text-gray-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-0.5 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </div>
      )}

      {needle ? (
        <section aria-label="Search results" className="mt-4">
          {found.length > 0 ? (
            <>
              <p className="text-sm text-muted" aria-live="polite">
                {dishes(found.length)} for “{query.trim()}”
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">
                {found.map((item) => (
                  <DishCard key={item.id} item={item} showSection {...add} />
                ))}
              </ul>
            </>
          ) : (
            <div className="flex flex-col items-center py-10 text-center" aria-live="polite">
              <SearchX className="size-8 text-muted" aria-hidden />
              <p className="mt-3 font-semibold text-ink">No dish matches “{query.trim()}”</p>
              <p className="mt-1 text-sm text-muted">Try another word, or look through the sections.</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 h-10 rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                Show the whole menu
              </button>
            </div>
          )}
        </section>
      ) : (
        <>
          {tabs.length > 1 && <MenuTabs tabs={tabs} shown={current.id} onShow={showSection} />}

          {current && (
            <section id={`${current.id}-panel`} role={tabs.length > 1 ? "tabpanel" : undefined} aria-labelledby={`${current.id}-heading`} className="mt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={`${current.id}-heading`} className="flex items-center gap-1.5 text-lg font-bold text-ink">
                  {current.id === "menu-popular" && <Flame className="size-5 text-brand-600" aria-hidden />}
                  {current.label}
                </h3>
                <span className="text-sm text-muted">{current.id === "menu-popular" ? "Most ordered here" : dishes(shownItems.length)}</span>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">
                {shownItems.map((item) => (
                  <DishCard key={item.id} item={item} {...add} />
                ))}
              </ul>
              <NextSection tabs={tabs} shown={current.id} onShow={showSection} />
            </section>
          )}
        </>
      )}

      {opened && (
        <DishSheet
          key={opened.id}
          item={opened}
          storeName={storeName}
          popular={popularIds.has(opened.id)}
          inCart={quantities[opened.id] ?? 0}
          busy={busy === opened.id}
          error={message}
          ordering={ordering}
          onSave={(n) => setQuantity(opened, n)}
          onClose={() => setOpenId(null)}
        />
      )}

      <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+1rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-[440px] space-y-2 px-4">
        {message && (
          <p role="status" className="rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
            {message}
          </p>
        )}
        {count > 0 && (
          <Link
            href="/resident/cart"
            className="flex h-16 items-center gap-3 rounded-2xl bg-brand-600 pr-3 pl-3 text-white shadow-[0_12px_28px_-10px_rgba(210,70,0,0.6)] transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15" aria-hidden>
              <ShoppingBag className="size-5" />
              <span
                key={count}
                className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-brand-700 tabular-nums motion-reduce:animate-none"
              >
                {count}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block leading-tight font-semibold">View cart</span>
              <span className="block truncate text-xs text-white/80">
                {count} {count === 1 ? "item" : "items"} · {otherStores ? `+ ${otherStores} other ${otherStores === 1 ? "store" : "stores"}` : storeName}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[11px] leading-tight text-white/75">Subtotal</span>
              <span className="block font-bold tabular-nums">{formatPeso(subtotal)}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-white/80" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

type AddProps = {
  quantities: Record<string, number>;
  busy: string | null;
  ordering: Ordering;
  onOpen: (id: string) => void;
  onAdd: (item: MenuItem) => void;
};

/** The round + on a dish photo: adds one, up to what's left. */
function QuickAdd({ item, quantities, busy, ordering, onAdd, className = "" }: AddProps & { item: MenuItem; className?: string }) {
  const quantity = quantities[item.id] ?? 0;
  if (!ordering.canOrder || isSoldOut(item)) return null;
  const atLimit = item.stock !== null && quantity >= item.stock;
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      disabled={busy === item.id || atLimit}
      aria-label={quantity ? `Add one more ${item.name}` : `Add ${item.name} to cart`}
      className={`z-10 flex size-9 items-center justify-center rounded-full bg-white text-brand-600 shadow-md ring-1 ring-black/5 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-brand-500 active:scale-95 disabled:text-gray-300 disabled:hover:scale-100 ${className}`}
    >
      {busy === item.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-5" strokeWidth={2.5} aria-hidden />}
    </button>
  );
}

function InCartBadge({ quantity }: { quantity: number }) {
  if (!quantity) return null;
  return (
    <span className="absolute top-1.5 left-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm tabular-nums">
      {quantity}
      <span className="sr-only"> in your cart</span>
    </span>
  );
}

/** Sold out, only a few left, or all that's left already in the cart. */
function StockNote({ item, quantity }: { item: MenuItem; quantity: number }) {
  if (isSoldOut(item)) return <p className="mt-1 text-xs font-semibold text-red-600">Sold out</p>;
  if (item.stock === null || item.stock > 5) return null;
  return (
    <p className="mt-1 text-xs font-semibold text-amber-700">
      {quantity >= item.stock ? `All ${item.stock} left are in your cart` : `Only ${item.stock} left`}
    </p>
  );
}

/** A dish as a photo card: picture first, then the name, a short description and the price. */
function DishCard({ item, showSection, ...add }: AddProps & { item: MenuItem; showSection?: boolean }) {
  const soldOut = isSoldOut(item);
  const quantity = add.quantities[item.id] ?? 0;
  return (
    <li className="relative flex flex-col">
      <div className="relative">
        <DishPhoto src={item.imageUrl} dim={soldOut} sizes="(max-width: 440px) 50vw, 200px" className="aspect-[4/3] rounded-2xl" />
        <InCartBadge quantity={quantity} />
        <QuickAdd item={item} {...add} className="absolute right-2 bottom-2" />
      </div>
      {showSection && <p className="mt-2 text-xs font-medium text-muted">{item.category}</p>}
      <h4 className={`${showSection ? "mt-0.5" : "mt-2"} line-clamp-2 text-[15px] leading-snug font-semibold ${soldOut ? "text-muted" : "text-ink"}`}>{item.name}</h4>
      {item.description && <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{item.description}</p>}
      <p className="mt-auto pt-1.5 font-bold text-ink">{formatPeso(item.price)}</p>
      <StockNote item={item} quantity={quantity} />
      {/* The whole card opens the dish; the + sits above it */}
      <button
        type="button"
        onClick={() => add.onOpen(item.id)}
        aria-label={`${item.name}, ${formatPeso(item.price)}. See details`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      />
    </li>
  );
}

/** At the end of a section, the way on to the next one, so nobody has to scroll back up to the tabs. */
function NextSection({ tabs, shown, onShow }: { tabs: MenuTab[]; shown: string; onShow: (id: string) => void }) {
  const next = tabs[tabs.findIndex((t) => t.id === shown) + 1];
  if (!next) return null;
  return (
    <button
      type="button"
      onClick={() => onShow(next.id)}
      className="mt-6 flex h-12 w-full items-center justify-between rounded-xl bg-canvas px-4 text-sm font-semibold text-ink transition hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <span>
        Next: {next.label} <span className="font-normal text-muted">· {dishes(next.count)}</span>
      </span>
      <ChevronRight className="size-5 text-muted" aria-hidden />
    </button>
  );
}

type MenuTab = { id: string; label: string; count: number };

/**
 * The menu's sections as tabs, kept under the top bar. Choosing one shows only that section.
 * Left and right arrow keys move between them, as with any tabs.
 */
function MenuTabs({ tabs, shown, onShow }: { tabs: MenuTab[]; shown: string; onShow: (id: string) => void }) {
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = row.current;
    const tab = box?.querySelector<HTMLElement>(`[data-id="${shown}"]`);
    if (box && tab) box.scrollTo({ left: tab.offsetLeft - (box.clientWidth - tab.offsetWidth) / 2, behavior: "smooth" });
  }, [shown]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(tabs.findIndex((t) => t.id === shown) + step + tabs.length) % tabs.length];
    onShow(next.id);
    row.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  }

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mt-3 border-b border-line bg-white/95 backdrop-blur">
      <div ref={row} role="tablist" aria-label="Menu sections" onKeyDown={onKeyDown} className="relative flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
        {tabs.map((tab) => {
          const active = tab.id === shown;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-id={tab.id}
              aria-selected={active}
              aria-controls={`${tab.id}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onShow(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                active ? "bg-ink text-white" : "bg-canvas text-ink hover:bg-gray-200"
              }`}
            >
              {tab.id === "menu-popular" && <Flame className={`size-4 ${active ? "text-brand-300" : "text-brand-600"}`} aria-hidden />}
              {tab.label}
              <span className={`text-xs tabular-nums ${active ? "text-white/70" : "text-muted"}`}>{tab.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One dish in full, rising from the bottom like a phone sheet: the big photo, the whole
 * description, and how many to get. Esc, the X or tapping outside closes it.
 */
function DishSheet({
  item,
  storeName,
  popular,
  inCart,
  busy,
  error,
  ordering,
  onSave,
  onClose,
}: {
  item: MenuItem;
  storeName: string;
  popular: boolean;
  inCart: number;
  busy: boolean;
  /** Why the last change didn't go through; the page's own message is hidden behind the sheet */
  error?: string;
  ordering: Ordering;
  onSave: (quantity: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [count, setCount] = useState(Math.max(1, inCart));
  const soldOut = isSoldOut(item);
  const max = item.stock ?? 99;
  const sold = item.soldCount ?? 0;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function save() {
    if (count === inCart || (await onSave(count))) ref.current?.close();
  }

  let action: string;
  if (inCart === 0) action = `Add to cart · ${formatPeso(Number(item.price) * count)}`;
  else if (count === 0) action = "Remove from cart";
  else if (count === inCart) action = "Done";
  else action = `Update cart · ${formatPeso(Number(item.price) * count)}`;

  return (
    <dialog
      ref={ref}
      aria-labelledby="dish-name"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="mx-auto mt-auto mb-0 max-h-dvh w-full max-w-[440px] bg-transparent p-0 backdrop:bg-ink/50"
    >
      <div className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl bg-white transition-transform duration-300 ease-out starting:translate-y-full motion-reduce:transition-none">
        <div className="overflow-y-auto">
          <div className="relative">
            <DishPhoto src={item.imageUrl} dim={soldOut} eager sizes="440px" className="aspect-[4/3]" />
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-white/95 text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="px-5 pt-4 pb-5">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{item.category}</p>
            <h2 id="dish-name" className="mt-0.5 text-xl leading-tight font-bold text-ink">
              {item.name}
            </h2>
            <p className="mt-1 text-lg font-bold text-ink">{formatPeso(item.price)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold">
              {popular && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
                  <Flame className="size-3.5" aria-hidden />
                  Popular
                </span>
              )}
              {sold > 0 && <span className="rounded-full bg-canvas px-2.5 py-1 text-ink">Ordered {sold} times</span>}
              {soldOut ? (
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">Sold out</span>
              ) : (
                item.stock !== null && item.stock <= 5 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">Only {item.stock} left</span>
              )}
            </div>
            <p className="mt-4 text-[15px] leading-relaxed text-ink">{item.description ?? "No description from the store yet."}</p>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted">
              <ShoppingBag className="size-4 shrink-0" aria-hidden />
              From {storeName}
              {inCart > 0 && ` · ${inCart} in your cart`}
            </p>
          </div>
        </div>

        <div className="border-t border-line bg-white px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {soldOut || !ordering.canOrder ? (
            <p className="flex h-12 items-center justify-center rounded-xl bg-canvas text-center text-sm font-semibold text-muted">
              {soldOut ? "Sold out for now" : ordering.closedText}
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-full border border-line p-1" role="group" aria-label="How many">
                <button
                  type="button"
                  onClick={() => setCount((n) => n - 1)}
                  disabled={count <= (inCart > 0 ? 0 : 1)}
                  aria-label="Fewer"
                  className="flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 disabled:text-gray-300"
                >
                  <Minus className="size-4" aria-hidden />
                </button>
                <span className="min-w-7 text-center font-bold text-ink tabular-nums" aria-live="polite">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => setCount((n) => n + 1)}
                  disabled={count >= max}
                  aria-label="More"
                  className="flex size-10 items-center justify-center rounded-full text-ink transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand-500 disabled:text-gray-300"
                >
                  <Plus className="size-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  count === 0 ? "border border-red-200 bg-white text-red-700 hover:bg-red-50" : count === inCart ? "border border-line bg-white text-ink hover:bg-canvas" : "bg-brand-600 text-white hover:bg-brand-700"
                }`}
              >
                {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                {action}
              </button>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
