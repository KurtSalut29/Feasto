import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Barcode } from "@/components/app/barcode";
import { DashboardSkeleton } from "@/components/app/dashboard-shell";
import { Line, ReceiptPaper, Rule, slipDate, slipTime } from "@/components/app/receipt-paper";
import { ButtonLink } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { orderCode, paymentName } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { VendorOrderDetail } from "@/lib/types";
import { PrintButton } from "@/components/app/print-button";

export const metadata: Metadata = { title: "Order slip" };

export default function OrderSlipPage({ params }: PageProps<"/vendor/orders/[id]/slip">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <OrderSlip params={params} />
    </Suspense>
  );
}

/**
 * The slip a store prints for an order: the kitchen reads the big order code, the dishes and the
 * note; whoever bags it checks the customer, the rider and whether cash is due at the door.
 */
async function OrderSlip({ params }: Pick<PageProps<"/vendor/orders/[id]/slip">, "params">) {
  await requireRole("VENDOR");
  const { id } = await params;
  const { order } = await serverApi<{ order: VendorOrderDetail }>(`/vendor/orders/${id}`);
  const code = orderCode(order.id).slice(1);
  const delivery = order.fulfillment === "DELIVERY";
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = Number(order.subtotal);
  const fee = delivery ? Number(order.deliveryFee) : 0;
  const total = subtotal + fee;
  const paid = order.checkout.paymentStatus === "PAID";
  const cash = order.checkout.paymentMethod === "COD";

  return (
    <div data-receipt-page className="pb-4">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden lg:pr-16">
        <div>
          <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink">Order slip</h1>
          <p className="mt-1 text-[15px] text-muted">For the kitchen and the bag. Print it, or save it as a PDF.</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href={`/vendor/orders/${order.id}`} variant="secondary">
            <ArrowLeft className="size-[18px]" aria-hidden />
            Back to order
          </ButtonLink>
          <PrintButton />
        </div>
      </div>

      <div className="rounded-2xl bg-gray-100/70 px-4 py-8 print:m-0 print:bg-white print:p-0">
        <ReceiptPaper label={`Order slip for ${orderCode(order.id)}`}>
          <header className="text-center">
            <Image src="/Logo/feasto-logo.png" alt="Feasto" width={122} height={36} className="mx-auto h-9 w-[122px] object-contain grayscale" />
            <p className="mt-3 text-[15px] font-bold uppercase">{order.vendor.name}</p>
            <p className="text-[12px]">{order.vendor.address}</p>
          </header>

          <Rule />
          <p className="text-center font-bold tracking-[0.25em]">ORDER SLIP</p>
          <p className="mt-1 text-center text-[30px] leading-none font-bold tracking-wider">{orderCode(order.id)}</p>
          <p className="mt-1 text-center text-[14px] font-bold uppercase">{delivery ? "Delivery" : "Pickup"}</p>
          <Rule />

          <dl className="space-y-0.5">
            <Line label="Date" value={slipDate(order.createdAt)} />
            <Line label="Time" value={slipTime(order.createdAt)} />
            <Line label="Customer" value={order.checkout.resident.name} />
            {order.checkout.resident.phone && <Line label="Phone" value={order.checkout.resident.phone} />}
            {delivery && <Line label="Rider" value={order.rider?.name ?? "Not yet assigned"} />}
          </dl>
          {delivery && order.checkout.deliveryAddress && <p className="mt-1 text-[12px]">Deliver to: {order.checkout.deliveryAddress}</p>}

          {order.checkout.notes && (
            <div className="mt-3 border-2 border-[#222] px-2.5 py-2">
              <p className="text-[11px] font-bold tracking-[0.2em]">NOTE</p>
              <p className="text-[14px] font-bold">{order.checkout.notes}</p>
            </div>
          )}

          <Rule />
          <div className="flex justify-between text-[12px] font-bold">
            <span>QTY ITEM</span>
            <span>AMOUNT</span>
          </div>
          <Rule light />
          <ul className="space-y-1.5">
            {order.items.map((item) => (
              <li key={item.id}>
                <div className="flex justify-between gap-3 text-[15px] font-bold">
                  <span className="min-w-0">
                    <span className="inline-block w-8">{item.quantity}×</span>
                    {item.name}
                  </span>
                  <span className="shrink-0 tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
                </div>
                {item.quantity > 1 && <p className="pl-8 text-[12px] text-[#555]">@ {formatPeso(Number(item.unitPrice))} each</p>}
                {/* The kitchen reads this before cooking, so it's loud on paper too */}
                {item.note && <p className="pl-8 text-[13px] font-bold uppercase">** {item.note} **</p>}
              </li>
            ))}
          </ul>

          <Rule />
          <dl className="space-y-0.5">
            <Line label={`Food (${count} ${count === 1 ? "item" : "items"})`} value={formatPeso(subtotal)} />
            {delivery && <Line label="Delivery fee" value={fee ? formatPeso(fee) : "FREE"} />}
          </dl>
          <Rule double />
          <div className="flex justify-between text-[17px] font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatPeso(total)}</span>
          </div>
          <Rule double />
          <dl className="space-y-0.5">
            <Line label="Payment" value={cash ? "Cash" : paymentName(order.checkout)} />
            <Line label="Status" value={order.checkout.paymentStatus === "REFUNDED" ? "REFUNDED" : paid ? "PAID" : "NOT YET PAID"} />
          </dl>
          {!paid && cash && (
            <p className="mt-2 text-center text-[14px] font-bold">
              {delivery ? `RIDER COLLECTS ${formatPeso(total)}` : `COLLECT ${formatPeso(total)} AT PICKUP`}
            </p>
          )}

          <Rule />
          <Barcode value={code} className="mx-auto h-12 w-full max-w-[260px] text-[#111]" />
          <p className="mt-1 text-center tracking-[0.3em]">{code}</p>
          <p className="mt-3 text-center text-[11px] text-[#555]">Feasto order slip · Not an official receipt (OR)</p>
        </ReceiptPaper>
      </div>
    </div>
  );
}
