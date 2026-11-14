"use client";

import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { celebrate, useCelebrating } from "@/components/app/celebrate";
import { Line, ReceiptPaper, Rule, slipDate, slipTime } from "@/components/app/receipt-paper";
import { buttonClass } from "@/components/ui/button";
import { formatPeso } from "@/lib/format";
import type { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

export type MomentOrder = {
  id: string;
  code: string;
  storeName: string;
  fulfillment: Fulfillment;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** "GCash", "Cash on delivery", … */
  paymentLabel: string;
  createdAt: string;
  finishedAt: string | null;
  items: { id: string; name: string; unitPrice: string; quantity: number }[];
  deliveryFee: number;
  total: number;
};

const MINUTE = 60_000;
const SHOWN_ITEMS = 4;

/** Whether this moment was already shown for this order, here or before a reload. */
const shownHere = new Set<string>();
function firstTime(key: string) {
  const storageKey = `feasto:moment:${key}`;
  if (shownHere.has(storageKey)) return false;
  shownHere.add(storageKey);
  try {
    if (localStorage.getItem(storageKey)) return false;
    localStorage.setItem(storageKey, "1");
  } catch {
    // Private mode: remembering it for this visit is enough
  }
  return true;
}

const recent = (iso: string | null, ms: number) => !!iso && Date.now() - Date.parse(iso) < ms;

/**
 * The order page's big moments, each shown once and only while it's fresh:
 * - chef Feasto says "Delivered!" (or "Enjoy your meal!" for a pickup) when the order arrives;
 * - the receipt prints out once the order is paid: right after an online payment goes
 *   through, or on delivery when paying cash.
 * They wait for each other, so the chef finishes before the receipt prints.
 */
export function OrderMoments({ order }: { order: MomentOrder }) {
  const celebrating = useCelebrating();
  const [receipt, setReceipt] = useState(false);
  const closeReceipt = useCallback(() => setReceipt(false), []);
  const { id, status, paymentMethod, paymentStatus, createdAt, finishedAt, storeName, fulfillment } = order;

  useEffect(() => {
    if (celebrating || receipt) return;
    const received = status === "DELIVERED" || status === "COMPLETED";
    const dropped = status === "REJECTED" || status === "CANCELLED";

    if (received && recent(finishedAt, 30 * MINUTE) && firstTime(`arrived:${id}`)) {
      celebrate(
        fulfillment === "DELIVERY"
          ? { title: "Delivered!", message: `Your order from ${storeName} is here. Enjoy your meal!` }
          : { title: "Enjoy your meal!", message: `You collected your order from ${storeName}.` },
      );
      return;
    }
    const paidOnline = paymentMethod === "ONLINE" && paymentStatus === "PAID" && !dropped && recent(createdAt, 20 * MINUTE);
    const paidCash = paymentMethod === "COD" && received && recent(finishedAt, 30 * MINUTE);
    if (!paidOnline && !paidCash) return;
    // A short breath after the page settles (or the chef leaves) before the printer starts
    const timer = setTimeout(() => {
      if (firstTime(`receipt:${id}`)) setReceipt(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [celebrating, receipt, id, status, paymentMethod, paymentStatus, createdAt, finishedAt, storeName, fulfillment]);

  return receipt ? <PrintedReceipt order={order} onClose={closeReceipt} /> : null;
}

/** The receipt coming out of a little printer, then stamped PAID. */
function PrintedReceipt({ order, onClose }: { order: MomentOrder; onClose: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  const shown = order.items.slice(0, SHOWN_ITEMS);
  const more = order.items.length - shown.length;
  const paidAt = order.paymentMethod === "COD" ? (order.finishedAt ?? order.createdAt) : order.createdAt;

  useEffect(() => {
    doneRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Receipt for order ${order.code}`} className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8">
      <div aria-hidden onClick={onClose} className="fx-backdrop fixed inset-0 bg-ink/55 backdrop-blur-[3px]" />

      <div className="relative w-full max-w-[360px]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the receipt"
          className="fx-rise absolute -top-1 -right-1 z-10 flex size-9 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25 [--fx-delay:2.4s]"
        >
          <X className="size-[18px]" aria-hidden />
        </button>

        {/* The printer */}
        <div className="relative z-10 mx-auto mt-6 flex h-9 w-[300px] max-w-full items-center justify-between rounded-2xl bg-[#26364a] px-4 shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)]">
          <span className="text-[0.6875rem] font-bold tracking-[0.25em] text-white/60">FEASTO</span>
          <span aria-hidden className="fx-led size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          <span aria-hidden className="absolute inset-x-6 -bottom-[3px] h-[6px] rounded-full bg-[#0d151f]" />
        </div>

        {/* The slip, coming out of the slot */}
        <div className="-mt-[3px] overflow-hidden px-3 pb-6">
          <div className="fx-print">
            <div className="fx-thud relative">
              <ReceiptPaper label={`Receipt for order ${order.code}`}>
                <div className="text-center">
                  <Image src="/Logo/feasto-mascot.png" alt="" width={44} height={44} unoptimized className="mx-auto mb-1 size-11 grayscale contrast-125" />
                  <p className="text-[0.9375rem] font-bold tracking-[0.2em]">FEASTO</p>
                  <p className="font-bold">{order.storeName}</p>
                  <p>
                    Order {order.code} · {order.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"}
                  </p>
                  <p>
                    {slipDate(paidAt)} {slipTime(paidAt)}
                  </p>
                </div>
                <Rule />
                <dl className="space-y-1">
                  {shown.map((item) => (
                    <Line key={item.id} label={`${item.quantity}x ${item.name}`} value={formatPeso(Number(item.unitPrice) * item.quantity)} />
                  ))}
                  {more > 0 && <p>+{more} more</p>}
                </dl>
                {order.fulfillment === "DELIVERY" && (
                  <>
                    <Rule light />
                    <dl className="space-y-1">
                      <Line label="Delivery fee" value={order.deliveryFee ? formatPeso(order.deliveryFee) : "Free"} />
                    </dl>
                  </>
                )}
                <Rule double />
                <dl className="text-[0.9375rem] font-bold">
                  <Line label="TOTAL" value={formatPeso(order.total)} />
                </dl>
                <dl className="mt-1">
                  <Line label="Paid with" value={order.paymentLabel} />
                </dl>
                <Rule light />
                <p className="text-center">Salamat! Enjoy your meal.</p>

                {/* The stamp */}
                <div
                  aria-hidden
                  className="fx-stamp pointer-events-none absolute top-6 right-3 rounded-lg border-[3px] border-emerald-600 px-3 py-1 text-center font-bold text-emerald-600 opacity-90 mix-blend-multiply"
                >
                  <p className="text-[1.625rem] leading-none tracking-[0.15em]">PAID</p>
                  <p className="text-[0.625rem] leading-tight tracking-[0.2em]">{order.paymentMethod === "COD" ? "CASH" : order.paymentLabel.toUpperCase()}</p>
                </div>
              </ReceiptPaper>
            </div>
          </div>
        </div>

        <div className="fx-rise flex gap-2 px-3 [--fx-delay:2.4s]">
          <Link href={`/resident/orders/${order.id}/receipt`} onClick={onClose} className={`${buttonClass("secondary")} flex-1`}>
            Full receipt
          </Link>
          <button ref={doneRef} type="button" onClick={onClose} className={`${buttonClass()} flex-1`}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
