import { ClipboardList, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DashboardSkeleton, PageHeader } from "@/components/app/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/link-tabs";
import { requireRole } from "@/lib/auth";
import { formatDateTime, formatPeso } from "@/lib/format";
import { orderCode, PAYMENT_LABEL, STATUS_TONE, statusLabel } from "@/lib/order-status";
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
  { key: "all", label: "All" },
  { key: "active", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled / declined" },
] as const;
type Group = (typeof GROUPS)[number]["key"];

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
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader title="Orders" description="Every order across all stores. This page updates live." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <LinkTabs
          variant="pills"
          tabs={GROUPS.map((g) => ({ href: href({ group: g.key, page: undefined }), label: g.label, count: data.counts[g.key], active: g.key === group }))}
        />
        <form action="/admin/orders" className="relative w-full sm:w-72">
          <input type="hidden" name="group" value={group} />
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Order code, store or resident"
            aria-label="Search orders"
            className="h-10 w-full rounded-xl border border-line bg-white pr-3 pl-10 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
          />
        </form>
      </div>
      <Card>
        {data.orders.length === 0 ? (
          <EmptyState Icon={ClipboardList} title="No orders found" text={q ? `Nothing matches “${q}”.` : "Orders will appear here as residents check out."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Store</th>
                  <th className="px-5 py-3 font-semibold">Resident</th>
                  <th className="px-5 py-3 font-semibold">Rider</th>
                  <th className="px-5 py-3 font-semibold">Total</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-ink">{orderCode(o.id)}</p>
                      <p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p>
                    </td>
                    <td className="px-5 py-3 text-ink">{o.vendor.name}</td>
                    <td className="px-5 py-3 text-ink">{o.checkout.resident.name}</td>
                    <td className="px-5 py-3 text-muted">{o.fulfillment === "PICKUP" ? "Pickup" : (o.rider?.name ?? "—")}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{formatPeso(Number(o.subtotal) + Number(o.deliveryFee))}</p>
                      <p className="text-xs text-muted">{PAYMENT_LABEL[o.checkout.paymentMethod]}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[o.status]}>{statusLabel(o.status, o.fulfillment)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            <p className="text-muted">
              Page {page} of {lastPage} · {data.total} orders
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">
                  Previous
                </Link>
              )}
              {page < lastPage && (
                <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
