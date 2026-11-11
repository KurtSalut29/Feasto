import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Barcode } from "@/components/app/barcode";
import {
  Line,
  ReceiptPaper,
  Rule,
  slipDate as receiptDate,
  slipTime as receiptTime,
  slipYear,
} from "@/components/app/receipt-paper";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { hasReceipt, orderCode, paymentName } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { ResidentOrder } from "@/lib/types";
import { PrintButton } from "@/components/app/print-button";

export const metadata: Metadata = { title: "Receipt" };

export default function ReceiptPage({
  params,
}: PageProps<"/resident/orders/[id]/receipt">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Receipt params={params} />
    </Suspense>
  );
}

async function Receipt({
  params,
}: Pick<PageProps<"/resident/orders/[id]/receipt">, "params">) {
  const user = await requireRole("RESIDENT");
  const { id } = await params;
  const { order } = await serverApi<{ order: ResidentOrder }>(`/orders/${id}`);

  if (!hasReceipt(order)) {
    return (
      <EmptyState
        Icon={ReceiptText}
        title="No receipt yet"
        text="Your receipt is ready once the order is delivered or collected, or once an online payment goes through."
        action={
          <ButtonLink href={`/resident/orders/${order.id}`}>
            Back to the order
          </ButtonLink>
        }
      />
    );
  }

  const code = orderCode(order.id).slice(1);
  const count = order.items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = Number(order.subtotal);
  const fee = Number(order.deliveryFee);
  const total = subtotal + fee;
  const checkoutTotal = Number(order.checkout.total);
  const otherStores = Math.abs(checkoutTotal - total) > 0.005;
  const paid =
    order.checkout.paymentStatus === "PAID" ||
    order.status === "DELIVERED" ||
    order.status === "COMPLETED";
  const cash = order.checkout.paymentMethod === "COD";
  const receiptNo = `${slipYear(order.createdAt)}-${code}`;

  return (
    <div data-receipt-page className="pb-4">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">
            Receipt
          </h1>
          <p className="text-sm text-muted">
            {order.vendor.name} · Order {orderCode(order.id)}
          </p>
        </div>
      </div>

      {/* The paper: a white slip with torn zigzag edges and a soft shadow that follows them */}
      <div className="-mx-4 bg-canvas px-4 py-6 print:m-0 print:bg-white print:p-0">
        <ReceiptPaper label={`Receipt for order ${orderCode(order.id)}`}>
          <header className="text-center">
            <Image
              src="/Logo/feasto-logo.png"
              alt="Feasto"
              width={122}
              height={36}
              className="mx-auto h-9 w-[122px] object-contain grayscale"
            />
            <p className="mt-1 text-[11px] tracking-[0.2em] uppercase">
              Order · Book · Enjoy
            </p>
            <p className="mt-3 text-[15px] font-bold uppercase">
              {order.vendor.name}
            </p>
            <p className="text-[12px]">{order.vendor.address}</p>
            {order.vendor.owner.phone && (
              <p className="text-[12px]">Tel. {order.vendor.owner.phone}</p>
            )}
          </header>

          <Rule />
          <p className="text-center font-bold tracking-[0.25em]">
            ORDER RECEIPT
          </p>
          <Rule />

          <dl className="space-y-0.5">
            <Line label="Receipt No." value={receiptNo} />
            <Line label="Order" value={orderCode(order.id)} />
            <Line label="Date" value={receiptDate(order.createdAt)} />
            <Line label="Time" value={receiptTime(order.createdAt)} />
            <Line label="Customer" value={user.name} />
            <Line
              label="Type"
              value={order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
            />
            {order.rider && <Line label="Rider" value={order.rider.name} />}
          </dl>
          {order.fulfillment === "DELIVERY" &&
            order.checkout.deliveryAddress && (
              <p className="mt-1 text-[12px]">
                Deliver to: {order.checkout.deliveryAddress}
              </p>
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
                <div className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="inline-block w-7">{item.quantity}</span>
                    {item.name}
                    {item.note && <span className="block pl-7 text-[12px] text-muted">Note: {item.note}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatPeso(Number(item.unitPrice) * item.quantity)}
                  </span>
                </div>
                {item.quantity > 1 && (
                  <p className="pl-7 text-[12px] text-[#555]">
                    @ {formatPeso(Number(item.unitPrice))} each
                  </p>
                )}
              </li>
            ))}
          </ul>

          <Rule />
          <dl className="space-y-0.5">
            <Line
              label={`Subtotal (${count} ${count === 1 ? "item" : "items"})`}
              value={formatPeso(subtotal)}
            />
            {order.fulfillment === "DELIVERY" && (
              <Line
                label="Delivery fee"
                value={fee ? formatPeso(fee) : "FREE"}
              />
            )}
          </dl>
          <Rule double />
          <div className="flex justify-between text-[17px] font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatPeso(total)}</span>
          </div>
          <Rule double />

          <dl className="space-y-0.5">
            <Line
              label="Payment"
              value={cash ? "Cash" : paymentName(order.checkout)}
            />
            <Line
              label={cash ? "Cash received" : "Amount paid"}
              value={paid ? formatPeso(total) : "—"}
            />
            <Line
              label="Status"
              value={
                order.checkout.paymentStatus === "REFUNDED"
                  ? "REFUNDED"
                  : paid
                    ? "PAID"
                    : "PENDING"
              }
            />
            {order.finishedAt && (
              <Line
                label={
                  order.fulfillment === "DELIVERY" ? "Delivered" : "Collected"
                }
                value={`${receiptDate(order.finishedAt)} ${receiptTime(order.finishedAt)}`}
              />
            )}
          </dl>
          {cash && order.fulfillment === "DELIVERY" && (
            <p className="mt-1 text-[12px]">
              Paid in cash to the rider on delivery.
            </p>
          )}
          {otherStores && (
            <p className="mt-1 text-[12px]">
              Part of one checkout with other stores. Checkout total:{" "}
              {formatPeso(checkoutTotal)}.
            </p>
          )}

          <Rule />
          <Barcode
            value={code}
            className="mx-auto h-12 w-full max-w-[260px] text-[#111]"
          />
          <p className="mt-1 text-center tracking-[0.3em]">{code}</p>

          <div className="mt-4 text-center">
            <p className="font-bold">
              THANK YOU, {user.name.split(" ")[0].toUpperCase()}!
            </p>
            <p className="text-[12px]">
              Enjoy your meal. Order again on Feasto.
            </p>
            <p className="mt-3 text-[11px] text-[#555]">
              This is your Feasto order receipt. It is not an official receipt
              (OR) for tax purposes.
              {!cash && " Online payments are simulated for this project."}
            </p>
          </div>
        </ReceiptPaper>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 print:hidden">
        <ButtonLink href={`/resident/orders/${order.id}`} variant="secondary">
          Back to order
        </ButtonLink>
        <PrintButton />
      </div>
    </div>
  );
}
