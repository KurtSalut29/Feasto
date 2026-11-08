import { Bike, CircleCheck, Hourglass, Phone, ShoppingBag, Store, User, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { SplitQueue } from "@/components/app/split-queue";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { requireRole } from "@/lib/auth";
import { formatPeso, renderTime } from "@/lib/format";
import { serverApi } from "@/lib/server-api";
import type { Fulfillment } from "@/lib/types";
import { StuckActions } from "./stuck-actions";

export const metadata: Metadata = { title: "Stuck orders" };

type Reason = "NO_STORE_REPLY" | "NO_RIDER" | "RIDER_NOT_COLLECTING" | "ON_THE_ROAD";
type Person = { name: string; phone: string | null };
type StuckOrder = {
  id: string;
  code: string;
  reason: Reason;
  since: string;
  fulfillment: Fulfillment;
  subtotal: string;
  deliveryFee: string;
  vendor: Person;
  rider: Person | null;
  checkout: { resident: Person };
};
type Response = {
  stuckMinutes: number;
  ridersOnline: number;
  page: number;
  pageSize: number;
  total: number;
  counts: Record<Reason | "all", number>;
  orders: StuckOrder[];
};

const REASONS: Reason[] = ["NO_STORE_REPLY", "NO_RIDER", "RIDER_NOT_COLLECTING", "ON_THE_ROAD"];
const REASON: Record<Reason, { label: string; tone: BadgeTone; dot: string; advice: string }> = {
  NO_STORE_REPLY: {
    label: "Store hasn't replied",
    tone: "warning",
    dot: "bg-amber-500",
    advice: "Call the store. If nobody answers, cancel so the resident isn't left waiting.",
  },
  NO_RIDER: { label: "No rider yet", tone: "danger", dot: "bg-red-500", advice: "Ask every rider to take it. If no one is available, call the resident or cancel." },
  RIDER_NOT_COLLECTING: {
    label: "Rider hasn't collected it",
    tone: "danger",
    dot: "bg-red-500",
    advice: "The food is ready. Call the rider, or give the job to another rider.",
  },
  ON_THE_ROAD: { label: "On the road too long", tone: "warning", dot: "bg-sky-500", advice: "Call the rider and the resident to find out what happened." },
};

/** "23 min", "2 h" or "3 days". */
function waited(iso: string, now: number) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function Contact({ Icon, role, person }: { Icon: LucideIcon; role: string; person: Person }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-canvas px-4 py-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-gray-400" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-wider text-muted uppercase">{role}</span>
        <span className="block truncate font-semibold text-ink">{person.name}</span>
        {person.phone ? (
          <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
            <Phone className="size-3" aria-hidden />
            {person.phone}
          </a>
        ) : (
          <span className="text-muted">No phone</span>
        )}
      </span>
    </li>
  );
}

export default function AdminStuckPage({ searchParams }: PageProps<"/admin/stuck">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Stuck searchParams={searchParams} />
    </Suspense>
  );
}

async function Stuck({ searchParams }: Pick<PageProps<"/admin/stuck">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const reason = REASONS.find((r) => r === params.reason);
  const data = await serverApi<Response>(`/admin/stuck?page=${page}${reason ? `&reason=${reason}` : ""}`);
  const now = renderTime();
  const selected = data.orders.find((o) => o.id === params.id) ?? data.orders[0];

  const href = (next: { reason?: Reason | null; page?: number; id?: string }) => {
    const query = new URLSearchParams();
    const r = next.reason === undefined ? reason : next.reason;
    if (r) query.set("reason", r);
    const p = next.page ?? (next.reason === undefined ? page : 1);
    if (p > 1) query.set("page", String(p));
    if (next.id) query.set("id", next.id);
    const text = query.toString();
    return text ? `/admin/stuck?${text}` : "/admin/stuck";
  };

  const tabs = [{ key: null, label: "All", dot: "bg-ink", count: data.counts.all }, ...REASONS.map((r) => ({ key: r, label: REASON[r].label, dot: REASON[r].dot, count: data.counts[r] }))];

  const detail = (order: StuckOrder) => {
    const why = REASON[order.reason];
    return (
      <article aria-label={`Order ${order.code}`} className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-ink">{order.code}</span>
              <Badge tone={why.tone} dot>
                {why.label}
              </Badge>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                {order.fulfillment === "DELIVERY" ? <Bike className="size-3.5" aria-hidden /> : <ShoppingBag className="size-3.5" aria-hidden />}
                {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
              </span>
              · {formatPeso(Number(order.subtotal) + Number(order.deliveryFee))}
            </p>
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-200 tabular-nums">
            <Hourglass className="size-4" aria-hidden />
            Stuck for {waited(order.since, now)}
          </p>
        </header>

        <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="text-[11px] font-semibold tracking-wider text-brand-700 uppercase">What to do</p>
          <p className="mt-1 text-sm text-ink">{why.advice}</p>
          <div className="mt-3">
            <StuckActions orderId={order.id} code={order.code} reason={order.reason} riderName={order.rider?.name ?? null} />
          </div>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2">
          <Contact Icon={Store} role="Store" person={order.vendor} />
          <Contact Icon={User} role="Resident" person={order.checkout.resident} />
          {order.rider && <Contact Icon={Bike} role="Rider" person={order.rider} />}
        </ul>
      </article>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Stuck orders"
        description={
          <>
            Orders waiting over {data.stuckMinutes} minutes for a store or rider, or over an hour on the road. The longest wait is on top. {data.ridersOnline} free{" "}
            {data.ridersOnline === 1 ? "rider is" : "riders are"} available now.{" "}
            <Link href="/admin/settings" className="font-semibold text-brand-700 hover:underline">
              Change the wait
            </Link>
          </>
        }
      />

      {data.counts.all === 0 ? (
        <Card>
          <EmptyState Icon={CircleCheck} title="Nothing is stuck" text="Every order is moving. Orders that wait too long appear here, and you'll get a notification." />
        </Card>
      ) : (
        <>
          {/* Why they're stuck, with how many of each */}
          <nav aria-label="Reason" className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-2">
              {tabs.map((tab) => {
                const active = (reason ?? null) === tab.key;
                return (
                  <li key={tab.key ?? "all"}>
                    <Link
                      href={href({ reason: tab.key })}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                        active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-gray-300"
                      }`}
                    >
                      <span aria-hidden className={`size-2 rounded-full ${active && tab.key === null ? "bg-white" : tab.dot}`} />
                      {tab.label}
                      <span className={`min-w-6 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums ${active ? "bg-white/20 text-white" : "bg-canvas text-muted"}`}>
                        {tab.count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <SplitQueue
            title={`${reason ? REASON[reason].label : "Stuck orders"} · ${data.total}`}
            order="Longest wait first"
            startAt={(page - 1) * data.pageSize + 1}
            selectedId={selected?.id}
            empty="Nothing is stuck for this reason."
            rows={data.orders.map((order) => {
              const why = REASON[order.reason];
              return {
                id: order.id,
                href: href({ id: order.id }),
                content: (
                  <>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-bold text-ink">
                        {order.code} <span className="font-medium text-muted">· {order.vendor.name}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 tabular-nums">
                        <Hourglass className="size-3.5" aria-hidden />
                        {waited(order.since, now)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted">
                      For {order.checkout.resident.name}
                      {order.rider ? ` · rider ${order.rider.name}` : ""}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-ink ring-1 ring-line">
                        <span aria-hidden className={`size-1.5 rounded-full ${why.dot}`} />
                        {why.label}
                      </span>
                      <span className="rounded-md bg-canvas px-1.5 py-0.5 text-muted tabular-nums">{formatPeso(Number(order.subtotal) + Number(order.deliveryFee))}</span>
                    </span>
                  </>
                ),
              };
            })}
            detail={selected ? detail(selected) : null}
            footer={
              data.total > data.pageSize ? (
                <Pagination page={page} pageSize={data.pageSize} total={data.total} noun="orders" href={(n) => href({ page: n })} />
              ) : undefined
            }
          />
        </>
      )}
    </>
  );
}
