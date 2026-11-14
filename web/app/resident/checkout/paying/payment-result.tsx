"use client";

import { CircleCheck, CircleX, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { celebrate } from "@/components/app/celebrate";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { apiRequest } from "@/lib/browser-api";
import { formatPeso } from "@/lib/format";
import { ONLINE_LABEL } from "@/lib/order-status";
import type { OnlinePayment, PaymentStatus } from "@/lib/types";

type Payment = {
  status: PaymentStatus;
  paymentUrl: string | null;
  onlineMethod: OnlinePayment | null;
  total: string;
  orderIds: string[];
  reason: string | null;
};

/** How often to ask while Xendit confirms, and when to offer the way back to the payment page */
const EVERY_MS = 2000;
const SLOW_AFTER_MS = 20_000;

/**
 * Asks Feasto (which asks Xendit) how the payment went, every two seconds until it's settled.
 * Paid: on to the order. Failed or expired: why, and what to do next. Still waiting: a way
 * back to the payment page, in case the resident left it before paying.
 */
export function PaymentResult({ checkoutId, backedOut }: { checkoutId: string; backedOut: boolean }) {
  const router = useRouter();
  const [payment, setPayment] = useState<Payment>();
  const [error, setError] = useState<string>();
  const [slow, setSlow] = useState(false);
  const started = useRef(0);

  useEffect(() => {
    if (!checkoutId) return;
    started.current = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      const result = await apiRequest<Payment>(`/checkout/${checkoutId}/payment`);
      if (stopped) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPayment(result.data);
      if (result.data.status === "PENDING") {
        if (Date.now() - started.current > SLOW_AFTER_MS) setSlow(true);
        timer = setTimeout(check, EVERY_MS);
      }
    }
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [checkoutId]);

  // Paid: celebrate, then on to the order (or the list, for several stores)
  useEffect(() => {
    if (payment?.status !== "PAID") return;
    const how = payment.onlineMethod ? ` with ${ONLINE_LABEL[payment.onlineMethod]}` : "";
    celebrate({ title: "Payment received!", message: `${formatPeso(payment.total)} paid${how}. Your order is on its way to the store.`, duration: 3200 });
    router.replace(payment.orderIds.length === 1 ? `/resident/orders/${payment.orderIds[0]}` : "/resident/orders");
  }, [payment, router]);

  if (!checkoutId || error) {
    return <Panel tone="bad" title="We couldn't find this payment" text={error ?? "Open your orders to see where it is."} actions={<ButtonLink href="/resident/orders">My orders</ButtonLink>} />;
  }

  if (!payment || payment.status === "PAID" || (payment.status === "PENDING" && !backedOut && !slow)) {
    return (
      <Panel
        tone={payment?.status === "PAID" ? "good" : "wait"}
        title={payment?.status === "PAID" ? "Payment received" : "Confirming your payment…"}
        text={payment?.status === "PAID" ? "Opening your order…" : "Xendit is telling Feasto how your payment went. This takes a few seconds."}
      />
    );
  }

  const orderLink = payment.orderIds.length === 1 ? `/resident/orders/${payment.orderIds[0]}` : "/resident/orders";

  if (payment.status === "PENDING") {
    return (
      <Panel
        tone="wait"
        title={backedOut ? "Your payment isn't finished" : "Still waiting for your payment"}
        text={`Your order is saved and the items are held for you. Pay ${formatPeso(payment.total)} to send it to the store, or cancel it from the order page.`}
        actions={
          <>
            {payment.paymentUrl && (
              <a href={payment.paymentUrl} className={buttonClass()}>
                <CreditCard className="size-5" aria-hidden />
                Go back to the payment page
              </a>
            )}
            <Link href={orderLink} className={buttonClass("secondary")}>
              See my order
            </Link>
          </>
        }
      />
    );
  }

  if (payment.status === "REFUNDED") {
    return <Panel tone="good" title="Paid, then refunded" text="Your order was cancelled after you paid, so the money went back to you." actions={<ButtonLink href={orderLink}>See my order</ButtonLink>} />;
  }

  return (
    <Panel
      tone="bad"
      title="Your payment didn't go through"
      text={`${payment.reason ?? "The payment wasn't completed"}. You weren't charged, and the order was cancelled. You can order again, or pay with cash.`}
      actions={
        <>
          <ButtonLink href={orderLink}>See the order</ButtonLink>
          <ButtonLink href="/resident" variant="secondary">
            Back to stores
          </ButtonLink>
        </>
      }
    />
  );
}

function Panel({ tone, title, text, actions }: { tone: "wait" | "good" | "bad"; title: string; text: string; actions?: React.ReactNode }) {
  const Icon = tone === "wait" ? LoaderCircle : tone === "good" ? CircleCheck : CircleX;
  const tint = tone === "wait" ? "bg-brand-50 text-brand-600 ring-brand-100" : tone === "good" ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-red-50 text-red-600 ring-red-100";
  return (
    <section role="status" className="mx-auto mt-6 max-w-md rounded-3xl border border-line bg-white p-6 text-center shadow-[0_8px_24px_-20px_rgba(31,45,61,0.5)]">
      {/* Keyed by tone: the spinner gives way to a check that pops in and draws itself */}
      <span key={tone} className={`mx-auto flex size-14 items-center justify-center rounded-2xl ring-1 ${tint} ${tone === "wait" ? "" : "fx-pop-in"}`}>
        <Icon className={`size-7 ${tone === "wait" ? "animate-spin motion-reduce:animate-none" : tone === "good" ? "fx-draw" : ""}`} aria-hidden />
      </span>
      <h2 className="mt-4 text-xl font-bold text-ink">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
      {actions && <div className="mt-5 flex flex-col gap-2">{actions}</div>}
      <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-3.5" aria-hidden />
        Payments by Xendit · test mode, no real money moves
      </p>
    </section>
  );
}
