"use client";

import { Gift, HeartHandshake, Search, Sparkles, TicketPercent, UserRoundPlus, Users, UserX, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/app/avatar";
import { useApiData } from "@/components/app/use-api-data";
import { VoucherTicket } from "@/components/app/voucher-ticket";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { apiRequest, type FieldErrors } from "@/lib/browser-api";
import { formatDate, formatPeso, timeAgo } from "@/lib/format";
import type { VoucherCard } from "@/lib/promos";

type Segment = "all" | "regulars" | "new" | "lapsing";
type Sort = "orders" | "spent" | "last";
type Customer = {
  id: string;
  name: string;
  email: string | null;
  /** In the month picked */
  orders: number;
  spent: number;
  average: number;
  /** Everything up to the month's end */
  total: number;
  spentAll: number;
  first: string;
  last: string;
  favourite: string | null;
  regular: boolean;
  isNew: boolean;
  lapsing: boolean;
  vouchersHeld: number;
};
type Data = {
  regularOrders: number;
  month: string;
  months: { key: string; label: string }[];
  summary: { customers: number; repeat: number; regulars: number; new: number; lapsing: number; spent: number };
  page: number;
  pageSize: number;
  total: number;
  customers: Customer[];
};

/**
 * Store › Customers and Admin › Customers: who keeps ordering and who stopped, with the numbers
 * behind it, and a voucher only the customers picked get. `mode` says whose: a store sees its own
 * customers and pays for its vouchers; Feasto sees everyone and pays for its own.
 */
export function CustomersView({ mode }: { mode: "store" | "feasto" }) {
  const api = mode === "store" ? "/vendor/customers" : "/admin/customers";
  const [month, setMonth] = useState<string | null>(null);
  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<Sort>("orders");
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<Map<string, Customer>>(new Map());
  const [giving, setGiving] = useState(false);

  // Search as they type, a moment after they stop
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(typed.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [typed]);

  const query = new URLSearchParams({ segment, sort, page: String(page), ...(q && { q }), ...(month && { month }) });
  const { data } = useApiData<Data>(`${api}?${query}`, reload);
  const regular = data?.regularOrders ?? 3;
  // "this month" while it's the month we're in; "in October 2026" for an earlier one
  const current = data ? data.months[0]?.key === data.month : true;
  const monthName = data?.months.find((m) => m.key === data.month)?.label ?? "";
  const inMonth = current ? "this month" : `in ${monthName}`;

  const cards: { key: Segment; label: string; note: string; value: number; Icon: LucideIcon; tone: string }[] = data
    ? [
        { key: "all", label: "Customers", note: `Ordered ${inMonth} · ${data.summary.repeat} more than once`, value: data.summary.customers, Icon: Users, tone: "bg-brand-50 text-brand-600 ring-brand-100" },
        { key: "regulars", label: "Regulars (suki)", note: `${regular}+ orders ${inMonth}`, value: data.summary.regulars, Icon: HeartHandshake, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
        { key: "new", label: "New", note: `First order ever ${inMonth}`, value: data.summary.new, Icon: UserRoundPlus, tone: "bg-sky-50 text-sky-600 ring-sky-100" },
        { key: "lapsing", label: "Haven't come back", note: `Ordered before, none ${inMonth}`, value: data.summary.lapsing, Icon: UserX, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
      ]
    : [];

  const toggle = (c: Customer) =>
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(c.id)) next.delete(c.id);
      else next.set(c.id, c);
      return next;
    });
  const pageIds = data?.customers.map((c) => c.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => picked.has(id));

  return (
    <div className="space-y-5 pb-24">
      {/* The totals double as the filter */}
      <nav aria-label="Customer groups" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {data
          ? cards.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={segment === c.key}
                onClick={() => {
                  setSegment(c.key);
                  setPage(1);
                }}
                className={`flex items-start gap-3 rounded-2xl border bg-white px-3.5 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-brand-500 sm:px-4 sm:py-3.5 ${
                  segment === c.key ? "border-brand-500 shadow-[0_0_0_3px_rgba(254,85,2,0.12)]" : "border-line hover:border-gray-300"
                }`}
              >
                <span className={`hidden size-10 shrink-0 items-center justify-center rounded-xl ring-1 sm:flex ${c.tone}`}>
                  <c.Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <c.Icon className={`size-4 shrink-0 sm:hidden ${c.tone.split(" ")[1]}`} aria-hidden />
                    {c.label}
                  </span>
                  <span className="block text-xl font-semibold text-ink tabular-nums">{c.value.toLocaleString("en-PH")}</span>
                  <span className="block text-xs text-muted">{c.note}</span>
                </span>
              </button>
            ))
          : Array.from({ length: 4 }, (_, i) => <span key={i} className="h-[6.5rem] animate-pulse rounded-2xl bg-canvas" />)}
      </nav>
      {data && (
        <p className="-mt-2 text-sm text-muted">
          {current ? "So far this month" : monthName}: {formatPeso(data.summary.spent)} from {data.summary.customers} {data.summary.customers === 1 ? "customer" : "customers"}
          {mode === "store" ? " (food, after discounts)" : " (orders with delivery, after discounts)"}.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Month
            <select
              value={data?.month ?? month ?? ""}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink"
            >
              {(data?.months ?? []).map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search customers by name</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search by name"
              className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-9 text-[0.9375rem] text-ink outline-none placeholder:text-gray-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink"
            >
              <option value="orders">Most orders</option>
              <option value="spent">Spent the most</option>
              <option value="last">Ordered most recently</option>
            </select>
          </label>
          {data && data.customers.length > 0 && (
            <label className="tap flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="size-4 accent-brand-600"
                checked={allOnPage}
                onChange={() =>
                  setPicked((m) => {
                    const next = new Map(m);
                    for (const c of data.customers) {
                      if (allOnPage) next.delete(c.id);
                      else next.set(c.id, c);
                    }
                    return next;
                  })
                }
              />
              Pick all {data.customers.length} shown
            </label>
          )}
        </div>

        {!data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="block h-16 animate-pulse rounded-xl bg-canvas" />
            ))}
          </div>
        ) : data.customers.length === 0 ? (
          <EmptyState
            Icon={Users}
            title={q ? `No customer named "${q}"` : "No customers here yet"}
            text={segment === "all" ? "Customers show up here once their first order arrives." : "Nobody fits this group right now. Try another group above."}
          />
        ) : (
          <ul className="divide-y divide-line">
            <li aria-hidden className="hidden items-center gap-3 bg-canvas/60 px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase md:flex">
              <span className="w-4 shrink-0" />
              <span className="w-9 shrink-0" />
              <span className="grid flex-1 grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-x-6">
                <span>Customer</span>
                <span>Orders {current ? "this month" : `(${monthName.split(" ")[0]})`}</span>
                <span>Spent {current ? "this month" : `(${monthName.split(" ")[0]})`}</span>
                <span>Last order</span>
              </span>
            </li>
            {data.customers.map((c) => (
              <li key={c.id}>
                <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-canvas/70 ${picked.has(c.id) ? "bg-brand-50/50" : ""}`}>
                  <input type="checkbox" className="mt-3 size-4 shrink-0 accent-brand-600" checked={picked.has(c.id)} onChange={() => toggle(c)} aria-label={`Pick ${c.name}`} />
                  <Avatar name={c.name} />
                  <span className="grid min-w-0 flex-1 gap-x-6 gap-y-1 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] md:items-center">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-ink">{c.name}</span>
                        {c.regular && <Tag tone="bg-emerald-50 text-emerald-700 ring-emerald-100">Suki</Tag>}
                        {c.isNew && <Tag tone="bg-sky-50 text-sky-700 ring-sky-100">New</Tag>}
                        {c.lapsing && <Tag tone="bg-amber-50 text-amber-800 ring-amber-200">Hasn&apos;t come back</Tag>}
                        {c.vouchersHeld > 0 && (
                          <Tag tone="bg-brand-50 text-brand-700 ring-brand-100">
                            <TicketPercent className="size-3" aria-hidden />
                            Has your voucher
                          </Tag>
                        )}
                      </span>
                      {c.email && <span className="block truncate text-xs text-muted">{c.email}</span>}
                      {c.favourite && (
                        <span className="block truncate text-xs text-muted">
                          {mode === "store" ? "Usually orders" : "Orders most from"} <span className="font-medium text-ink">{c.favourite}</span>
                        </span>
                      )}
                    </span>
                    <Stat label="Orders" value={c.orders.toLocaleString("en-PH")} note={`${c.total.toLocaleString("en-PH")} in all`} />
                    <Stat label="Spent" value={formatPeso(c.spent)} note={c.orders ? `${formatPeso(c.average)} per order` : `${formatPeso(c.spentAll)} in all`} />
                    <Stat label="Last order" value={timeAgo(c.last)} note={`Since ${formatDate(c.first)}`} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > data.pageSize && (
          <div className="border-t border-line px-4 py-3">
            <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                {(page - 1) * data.pageSize + 1}–{Math.min(page * data.pageSize, data.total)} of {data.total}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </span>
            </nav>
          </div>
        )}
      </section>

      {/* What's picked, and giving them a voucher (stays in reach while scrolling) */}
      {picked.size > 0 && (
        <div className="sticky bottom-[calc(var(--tabbar-h)+1rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-4 text-white shadow-xl">
          <p className="min-w-0 text-sm">
            <span className="font-semibold">{picked.size}</span> {picked.size === 1 ? "customer" : "customers"} picked
            <button type="button" onClick={() => setPicked(new Map())} className="tap ml-2 font-semibold text-white/75 underline-offset-2 hover:underline">
              Clear
            </button>
          </p>
          <Button className="shrink-0" onClick={() => setGiving(true)}>
            <Gift className="size-[18px]" aria-hidden />
            Give a voucher
          </Button>
        </div>
      )}

      <GiveVoucher
        open={giving}
        onClose={() => setGiving(false)}
        api={api}
        mode={mode}
        customers={[...picked.values()]}
        onSent={() => {
          setGiving(false);
          setPicked(new Map());
          setReload((n) => n + 1);
        }}
      />
    </div>
  );
}

function Tag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ${tone}`}>{children}</span>;
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <span className="flex items-baseline gap-2 md:block">
      <span className="w-16 shrink-0 text-xs text-muted md:hidden">{label}</span>
      <span className="text-sm font-semibold text-ink tabular-nums">{value}</span>
      <span className="text-xs text-muted md:block">{note}</span>
    </span>
  );
}

type Benefit = "AMOUNT_OFF" | "PERCENT_OFF" | "FREE_DELIVERY";

/** The voucher form, with a live look at the ticket the customers will get */
function GiveVoucher({ open, onClose, api, mode, customers, onSent }: { open: boolean; onClose: () => void; api: string; mode: "store" | "feasto"; customers: Customer[]; onSent: () => void }) {
  const allRegulars = customers.length > 0 && customers.every((c) => c.regular);
  const allLapsing = customers.length > 0 && customers.every((c) => c.lapsing);
  const suggested = allLapsing ? "We miss you!" : allRegulars ? "Salamat, suki!" : "A treat for you";
  const [title, setTitle] = useState("");
  const [benefit, setBenefit] = useState<Benefit>("AMOUNT_OFF");
  const [value, setValue] = useState("30");
  const [maxDiscount, setMax] = useState("");
  const [minSpend, setMin] = useState("150");
  const [days, setDays] = useState("7");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string>();

  const preview = useMemo<VoucherCard>(
    () => ({
      id: "preview",
      code: "FORYOU·····",
      title: title || suggested,
      benefit,
      value: benefit === "FREE_DELIVERY" ? 0 : Number(value) || 0,
      maxDiscount: Number(maxDiscount) || null,
      minSpend: Number(minSpend) || 0,
      store: mode === "store" ? { id: "", name: "Your store" } : null,
      campaign: null,
      startsAt: new Date().toISOString(),
      endsAt: null,
      firstOrder: false,
      usesLeft: 1,
      problem: null,
      upcoming: false,
      forYou: true,
    }),
    [title, suggested, benefit, value, maxDiscount, minSpend, mode],
  );

  async function send() {
    setBusy(true);
    setErrors({});
    setError(undefined);
    const result = await apiRequest<{ code: string; sent: number }>(`${api}/vouchers`, {
      method: "POST",
      body: {
        userIds: customers.map((c) => c.id),
        title: title.trim() || suggested,
        benefit,
        value: benefit === "FREE_DELIVERY" ? 0 : Number(value),
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        minSpend: Number(minSpend) || 0,
        days: Number(days),
        message: message || undefined,
      },
    });
    setBusy(false);
    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      else setError(result.error);
      return;
    }
    toast.success(
      `Sent to ${result.data.sent} ${result.data.sent === 1 ? "customer" : "customers"}`,
      `Code ${result.data.code}. They were told, and it's in their My vouchers. ${mode === "store" ? "Your store pays for it." : "Feasto pays for it."}`,
    );
    onSent();
  }

  const names = customers.slice(0, 3).map((c) => c.name.split(" ")[0]).join(", ") + (customers.length > 3 ? ` and ${customers.length - 3} more` : "");
  return (
    <Dialog open={open} onClose={onClose} title="Give a voucher" description={`For ${names}. Only they can use it, once each.`} wide>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <TextField label="Name they'll see" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested} maxLength={60} error={errors.title?.[0]} />
          <SegmentedControl<Benefit>
            name="benefit"
            legend="What it takes off"
            value={benefit}
            onChange={setBenefit}
            options={[
              { value: "AMOUNT_OFF", label: "₱ off" },
              { value: "PERCENT_OFF", label: "% off" },
              { value: "FREE_DELIVERY", label: "Free delivery" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            {benefit !== "FREE_DELIVERY" && (
              <TextField label={benefit === "PERCENT_OFF" ? "Percent off" : "Pesos off"} type="number" inputMode="decimal" min="1" value={value} onChange={(e) => setValue(e.target.value)} error={errors.value?.[0]} />
            )}
            {benefit !== "AMOUNT_OFF" && (
              <TextField label="At most (₱)" type="number" inputMode="decimal" min="1" value={maxDiscount} onChange={(e) => setMax(e.target.value)} hint="Optional" error={errors.maxDiscount?.[0]} />
            )}
            <TextField label="Minimum order (₱)" type="number" inputMode="decimal" min="0" value={minSpend} onChange={(e) => setMin(e.target.value)} error={errors.minSpend?.[0]} />
            <TextField label="Good for (days)" type="number" inputMode="numeric" min="1" max="60" value={days} onChange={(e) => setDays(e.target.value)} error={errors.days?.[0]} />
          </div>
          <TextField label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} placeholder="Salamat sa palaging pag-order!" />
        </div>
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Sparkles className="size-4 text-brand-600" aria-hidden />
            What they&apos;ll get
          </p>
          <VoucherTicket voucher={preview} />
          <p className="text-[0.8125rem] text-muted">
            The code is made for you. Each customer gets a notification and finds it in My vouchers.{" "}
            {mode === "store" ? "It works at your store only, and your store pays for the discount." : "It works at every store, and Feasto pays for the discount."}
          </p>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={send}>
          <Gift className="size-[18px]" aria-hidden />
          Send to {customers.length} {customers.length === 1 ? "customer" : "customers"}
        </Button>
      </div>
    </Dialog>
  );
}
