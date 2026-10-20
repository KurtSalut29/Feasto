import { Bike, CircleCheck, CircleX, ClipboardList, Clock, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SearchBox } from "@/components/ui/search-box";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso, timeAgo } from "@/lib/format";
import { orderCode, PAYMENT_LABEL, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

type Row = {
  id: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  subtotal: string;
  deliveryFee: string;
  createdAt: string;
  vendor: { name: string };
  rider: { name: string } | null;
  checkout: { paymentMethod: PaymentMethod; paymentStatus: PaymentStatus; resident: { name: string } };
};
type Response = { orders: Row[]; page: number; pageSize: number; total: number; counts: Record<Group, number> };
const GROUPS = [
  { key: "all", label: "All orders", Icon: ClipboardList, tone: "bg-canvas text-muted ring-line" },
  { key: "active", label: "In progress", Icon: Clock, tone: "bg-brand-50 text-brand-600 ring-brand-100" },
  { key: "completed", label: "Completed", Icon: CircleCheck, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  { key: "cancelled", label: "Cancelled / declined", Icon: CircleX, tone: "bg-red-50 text-red-600 ring-red-100" },
] as const;
type Group = (typeof GROUPS)[number]["key"];

/** "12 min ago" for today's orders, the date and time for older ones. */
function recent(iso: string) {
  const ago = timeAgo(iso);
  return ago.endsWith("ago") || ago === "Just now" ? ago : formatDateTime(iso);
}

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminOrders searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminOrders({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const group: Group = GROUPS.find((g) => g.key === params.group)?.key ?? "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number(params.page) || 1);
  const query = new URLSearchParams({ group, page: String(page), ...(q && { q }) });
  const data = await serverApi<Response>(`/admin/orders?${query}`);
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams({ group, ...(q && { q }) });
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    return `/admin/orders?${next}`;
  };
  const current = GROUPS.find((g) => g.key === group)!;

  return (
    <>
      <PageHeader title="Orders" description="Every order across all stores. This page updates live." />

      {/* The totals double as the filter */}
      <nav aria-label="Order status" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {GROUPS.map(({ key, label, Icon, tone }) => {
          const active = key === group;
          return (
            <Link
              key={key}
              href={href({ group: key, page: undefined })}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition focus-visible:outline-2 focus-visible:outline-brand-500 ${
                active ? "border-brand-500 shadow-[0_0_0_3px_rgba(254,85,2,0.12)]" : "border-line hover:border-gray-300"
              }`}
            >
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tone}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm text-muted">{label}</span>
                <span className="block text-xl font-semibold text-ink tabular-nums">{data.counts[key]}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-semibold text-ink">{current.label}</h2>
            <p className="text-sm text-muted">{q ? `Matching “${q}”` : "Newest first"}</p>
          </div>
          <SearchBox
            action="/admin/orders"
            value={q}
            placeholder="Order code, store or resident"
            label="Search orders"
            keep={{ group }}
            clearHref={href({ q: undefined, page: undefined })}
          />
        </div>

        {data.orders.length === 0 ? (
          <EmptyState Icon={ClipboardList} title="No orders found" text={q ? `Nothing matches “${q}”.` : "Orders will appear here as residents check out."} />
        ) : (
          <div className="overflow-x-auto">
            <table className={`${TABLE} min-w-[960px]`}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Order</th>
                  <th className={TH}>Store</th>
                  <th className={TH}>Resident</th>
                  <th className={TH}>Fulfillment</th>
                  <th className={TH}>Payment</th>
                  <th className={`${TH} text-right`}>Total</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className={TBODY}>
                {data.orders.map((o) => (
                  <tr key={o.id} className={TR}>
                    <td className={TD}>
                      <p className="font-semibold text-ink">{orderCode(o.id)}</p>
                      <p className="text-xs whitespace-nowrap text-muted" title={new Date(o.createdAt).toLocaleString("en-PH")}>
                        {recent(o.createdAt)}
                      </p>
                    </td>
                    <td className={`${TD} font-medium text-ink`}>{o.vendor.name}</td>
                    <td className={`${TD} text-ink`}>{o.checkout.resident.name}</td>
                    <td className={TD}>
                      {o.fulfillment === "PICKUP" ? (
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          <Store className="size-4" aria-hidden /> Pickup
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-ink">
                          <Bike className="size-4 text-muted" aria-hidden />
                          {o.rider?.name ?? <span className="text-muted">No rider yet</span>}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <p className="text-ink">{PAYMENT_LABEL[o.checkout.paymentMethod]}</p>
                      <p className={`text-xs ${o.checkout.paymentStatus === "PAID" ? "text-emerald-700" : "text-muted"}`}>
                        {o.checkout.paymentMethod === "COD" && o.checkout.paymentStatus === "PENDING"
                          ? "Due on handover"
                          : paymentStatusLabel(o.checkout.paymentMethod, o.checkout.paymentStatus)}
                      </p>
                    </td>
                    <td className={`${TD} text-right font-semibold text-ink tabular-nums`}>{formatPeso(Number(o.subtotal) + Number(o.deliveryFee))}</td>
                    <td className={TD}>
                      <Badge tone={STATUS_TONE[o.status]} dot>
                        {statusLabel(o.status, o.fulfillment)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={data.pageSize} total={data.total} noun="orders" href={(n) => href({ page: n > 1 ? String(n) : undefined })} />
      </section>
    </>
  );
}
