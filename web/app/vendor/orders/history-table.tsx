import { Camera, ClipboardList } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { TABLE, TBODY, TD, TH, THEAD, TR } from "@/components/ui/table";
import { formatDateTime, formatPeso } from "@/lib/format";
import { orderCode, paymentName, paymentStatusLabel, STATUS_TONE, statusLabel } from "@/lib/order-status";
import type { VendorOrder } from "@/lib/types";
import { DishThumb } from "./order-parts";

const pageHref = (n: number) => (n > 1 ? `/vendor/orders?tab=done&page=${n}` : "/vendor/orders?tab=done");

/** Finished orders, newest first: delivered, collected, declined and cancelled, a page at a time. */
export function HistoryTable({
  orders,
  pages,
  outOfRange,
}: {
  orders: VendorOrder[];
  pages: { page: number; pageSize: number; total: number };
  /** A page number past the last page (an old link): offer the first page instead */
  outOfRange?: boolean;
}) {
  return (
    <Card>
      {outOfRange ? (
        <EmptyState
          Icon={ClipboardList}
          title="This page is empty"
          text="There are fewer finished orders now than when this link was made."
          action={
            <Link href={pageHref(1)} className="font-semibold text-brand-700 hover:underline">
              Go to the newest orders
            </Link>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState Icon={ClipboardList} title="No finished orders yet" text="Orders move here once they're delivered, collected, declined or cancelled." />
      ) : (
        <>
        {/* Phones: one card per order */}
        <ul className="divide-y divide-line md:hidden">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/vendor/orders/${order.id}`} className="block px-4 py-3.5 transition hover:bg-canvas/60">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-semibold text-ink">
                    {orderCode(order.id)} <span className="font-normal text-muted">· {order.checkout.resident.name}</span>
                  </p>
                  <p className="shrink-0 font-semibold text-ink tabular-nums">{formatPeso(order.subtotal)}</p>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Badge tone={STATUS_TONE[order.status]} dot>
                    {statusLabel(order.status, order.fulfillment)}
                  </Badge>
                  <span className="text-muted">{paymentName(order.checkout)}</span>
                  <span className="text-gray-500">{formatDateTime(order.createdAt)}</span>
                </div>
                {order.rejectReason && <p className="mt-1 truncate text-xs text-muted">“{order.rejectReason}”</p>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className={`${TABLE} min-w-[820px]`}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Order</th>
                <th className={TH}>Resident</th>
                <th className={TH}>Dishes</th>
                <th className={TH}>Payment</th>
                <th className={`${TH} text-right`}>Food total</th>
                <th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {orders.map((order) => (
                <tr key={order.id} className={TR}>
                  <td className={TD}>
                    <Link href={`/vendor/orders/${order.id}`} className="font-semibold text-ink hover:text-brand-700 hover:underline">
                      {orderCode(order.id)}
                    </Link>
                    <p className="text-xs text-muted">{formatDateTime(order.createdAt)}</p>
                  </td>
                  <td className={TD}>
                    <p className="text-ink">{order.checkout.resident.name}</p>
                    <p className="text-xs text-muted">{order.fulfillment === "DELIVERY" ? `Delivery${order.rider ? ` · ${order.rider.name}` : ""}` : "Pickup"}</p>
                  </td>
                  <td className={TD} title={order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}>
                    <div className="flex max-w-72 items-center gap-2">
                      <span className="flex shrink-0 -space-x-2">
                        {order.items.slice(0, 3).map((item) => (
                          <DishThumb key={item.id} src={item.menuItem?.imageUrl} className="size-7 ring-2 ring-white" />
                        ))}
                      </span>
                      <span className="min-w-0 truncate text-muted">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                    </div>
                  </td>
                  <td className={TD}>
                    <p className="text-ink">{paymentName(order.checkout)}</p>
                    <p className="text-xs text-muted">
                      {order.checkout.paymentStatus === "PENDING" && ["REJECTED", "CANCELLED"].includes(order.status)
                        ? "Not charged"
                        : paymentStatusLabel(order.checkout.paymentMethod, order.checkout.paymentStatus)}
                    </p>
                  </td>
                  <td className={`${TD} text-right font-semibold text-ink tabular-nums`}>{formatPeso(order.subtotal)}</td>
                  <td className={TD}>
                    <Badge tone={STATUS_TONE[order.status]} dot>
                      {statusLabel(order.status, order.fulfillment)}
                    </Badge>
                    {order.rejectReason && <p className="mt-1 max-w-48 truncate text-xs text-muted">“{order.rejectReason}”</p>}
                    {order.deliveryPhotoUrl && (
                      <a
                        href={order.deliveryPhotoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 flex w-fit items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                      >
                        <Camera className="size-3.5" aria-hidden />
                        Delivery photo
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pages.page} pageSize={pages.pageSize} total={pages.total} noun="orders" href={pageHref} />
        </>
      )}
    </Card>
  );
}
