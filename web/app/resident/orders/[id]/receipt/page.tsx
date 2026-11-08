import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { Courier_Prime } from "next/font/google";
import Image from "next/image";
import { Suspense } from "react";
import { Barcode } from "@/components/app/barcode";
import { MobileSkeleton } from "@/components/app/mobile-shell";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatPeso } from "@/lib/format";
import { hasReceipt, orderCode, paymentName } from "@/lib/order-status";
import { serverApi } from "@/lib/server-api";
import type { ResidentOrder } from "@/lib/types";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Receipt" };

// The typewriter look of a thermal receipt printer
const receiptFont = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-receipt" });

export default function ReceiptPage({ params }: PageProps<"/resident/orders/[id]/receipt">) {
  return (
    <Suspense fallback={<MobileSkeleton />}>
      <Receipt params={params} />
    </Suspense>
  );
}

const manila = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", ...options });
const receiptDate = (iso: string) => manila(iso, { month: "2-digit", day: "2-digit", year: "numeric" });
const receiptTime = (iso: string) => manila(iso, { hour: "2-digit", minute: "2-digit", hour12: true });

async function Receipt({ params }: Pick<PageProps<"/resident/orders/[id]/receipt">, "params">) {
  const user = await requireRole("RESIDENT");
  const { id } = await params;
  const { order } = await serverApi<{ order: ResidentOrder }>(`/orders/${id}`);

  if (!hasReceipt(order)) {
    return (
      <EmptyState
        Icon={ReceiptText}
        title="No receipt yet"
        text="Your receipt is ready once the order is delivered or collected, or once an online payment goes through."
        action={<ButtonLink href={`/resident/orders/${order.id}`}>Back to the order</ButtonLink>}
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
  const paid = order.checkout.paymentStatus === "PAID" || order.status === "DELIVERED" || order.status === "COMPLETED";
  const cash = order.checkout.paymentMethod === "COD";
  const receiptNo = `${manila(order.createdAt, { year: "numeric" })}-${code}`;

  return (
    <div data-receipt-page className="pb-4">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Receipt</h1>
          <p className="text-sm text-muted">
            {order.vendor.name} · Order {orderCode(order.id)}
          </p>
        </div>
      </div>

      {/* The paper: a white slip with torn zigzag edges and a soft shadow that follows them */}
      <div className="-mx-4 bg-canvas px-4 py-6 print:m-0 print:bg-white print:p-0">
        <article
          data-receipt
          aria-label={`Receipt for order ${orderCode(order.id)}`}
          className={`${receiptFont.className} mx-auto max-w-[340px] text-[13px] leading-snug text-[#222] [filter:drop-shadow(0_6px_14px_rgba(31,45,61,0.14))] print:[filter:none]`}
        >
          <div aria-hidden className="h-2 bg-[url('/receipt-edge-top.svg')] bg-[length:12px_8px] bg-repeat-x" />
          <div className="bg-white px-5 pt-4 pb-5">
            <header className="text-center">
              <Image src="/Logo/feasto-logo.png" alt="Feasto" width={122} height={36} className="mx-auto h-9 w-[122px] object-contain grayscale" />
              <p className="mt-1 text-[11px] tracking-[0.2em] uppercase">Order · Book · Enjoy</p>
              <p className="mt-3 text-[15px] font-bold uppercase">{order.vendor.name}</p>
              <p className="text-[12px]">{order.vendor.address}</p>
              {order.vendor.owner.phone && <p className="text-[12px]">Tel. {order.vendor.owner.phone}</p>}
            </header>

            <Rule />
            <p className="text-center font-bold tracking-[0.25em]">ORDER RECEIPT</p>
            <Rule />

            <dl className="space-y-0.5">
              <Line label="Receipt No." value={receiptNo} />
              <Line label="Order" value={orderCode(order.id)} />
              <Line label="Date" value={receiptDate(order.createdAt)} />
              <Line label="Time" value={receiptTime(order.createdAt)} />
              <Line label="Customer" value={user.name} />
              <Line label="Type" value={order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"} />
              {order.rider && <Line label="Rider" value={order.rider.name} />}
            </dl>
            {order.fulfillment === "DELIVERY" && order.checkout.deliveryAddress && (
              <p className="mt-1 text-[12px]">Deliver to: {order.checkout.deliveryAddress}</p>
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
                    </span>
                    <span className="shrink-0 tabular-nums">{formatPeso(Number(item.unitPrice) * item.quantity)}</span>
                  </div>
                  {item.quantity > 1 && <p className="pl-7 text-[12px] text-[#555]">@ {formatPeso(Number(item.unitPrice))} each</p>}
                </li>
              ))}
            </ul>

            <Rule />
            <dl className="space-y-0.5">
              <Line label={`Subtotal (${count} ${count === 1 ? "item" : "items"})`} value={formatPeso(subtotal)} />
              {order.fulfillment === "DELIVERY" && <Line label="Delivery fee" value={fee ? formatPeso(fee) : "FREE"} />}
            </dl>
            <Rule double />
            <div className="flex justify-between text-[17px] font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatPeso(total)}</span>
            </div>
            <Rule double />

            <dl className="space-y-0.5">
              <Line label="Payment" value={cash ? "Cash" : paymentName(order.checkout)} />
              <Line label={cash ? "Cash received" : "Amount paid"} value={paid ? formatPeso(total) : "—"} />
              <Line label="Status" value={order.checkout.paymentStatus === "REFUNDED" ? "REFUNDED" : paid ? "PAID" : "PENDING"} />
              {order.finishedAt && (
                <Line label={order.fulfillment === "DELIVERY" ? "Delivered" : "Collected"} value={`${receiptDate(order.finishedAt)} ${receiptTime(order.finishedAt)}`} />
              )}
            </dl>
            {cash && order.fulfillment === "DELIVERY" && <p className="mt-1 text-[12px]">Paid in cash to the rider on delivery.</p>}
            {otherStores && (
              <p className="mt-1 text-[12px]">
                Part of one checkout with other stores. Checkout total: {formatPeso(checkoutTotal)}.
              </p>
            )}

            <Rule />
            <Barcode value={code} className="mx-auto h-12 w-full max-w-[260px] text-[#111]" />
            <p className="mt-1 text-center tracking-[0.3em]">{code}</p>

            <div className="mt-4 text-center">
              <p className="font-bold">THANK YOU, {user.name.split(" ")[0].toUpperCase()}!</p>
              <p className="text-[12px]">Enjoy your meal. Order again on Feasto.</p>
              <p className="mt-3 text-[11px] text-[#555]">
                This is your Feasto order receipt. It is not an official receipt (OR) for tax purposes.
                {!cash && " Online payments are simulated for this project."}
              </p>
            </div>
          </div>
          <div aria-hidden className="h-2 bg-[url('/receipt-edge-bottom.svg')] bg-[length:12px_8px] bg-repeat-x" />
        </article>
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

function Rule({ double, light }: { double?: boolean; light?: boolean }) {
  return (
    <div
      aria-hidden
      className={`my-2.5 ${double ? "h-[5px] border-y border-dashed border-[#333]" : `border-t border-dashed ${light ? "border-[#bbb]" : "border-[#333]"}`}`}
    />
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0">{label}</dt>
      <dd className="min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
