import type { BadgeTone } from "@/components/ui/badge";
import type { Fulfillment, OnlinePayment, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

/** Short code shown to people, e.g. "#A1B2C3" (same as the server). */
export const orderCode = (id: string) => `#${id.slice(-6).toUpperCase()}`;

export function statusLabel(status: OrderStatus, fulfillment: Fulfillment) {
  const labels: Record<OrderStatus, string> = {
    AWAITING_PAYMENT: "Confirming payment",
    PLACED: "Waiting for the store",
    ACCEPTED: "Accepted",
    PREPARING: "Preparing",
    READY: fulfillment === "PICKUP" ? "Ready for pickup" : "Ready, waiting for rider",
    PICKED_UP: "On the way",
    DELIVERED: "Delivered",
    COMPLETED: "Collected",
    REJECTED: "Declined by the store",
    CANCELLED: "Cancelled",
  };
  return labels[status];
}

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  AWAITING_PAYMENT: "warning",
  PLACED: "warning",
  ACCEPTED: "brand",
  PREPARING: "brand",
  READY: "brand",
  PICKED_UP: "brand",
  DELIVERED: "success",
  COMPLETED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

export const isFinished = (status: OrderStatus) => ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"].includes(status);

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { COD: "Cash", ONLINE: "Online payment" };

export const ONLINE_LABEL: Record<OnlinePayment, string> = {
  GCASH: "GCash",
  MAYA: "Maya",
  GRABPAY: "GrabPay",
  SHOPEEPAY: "ShopeePay",
  COINS: "Coins.ph",
  VISA: "Visa",
  MASTERCARD: "Mastercard",
  JCB: "JCB",
  AMEX: "American Express",
};

/** "Cash", "GCash", "Card"… Orders from before wallets were offered say "Online payment". */
export function paymentName(checkout: { paymentMethod: PaymentMethod; onlineMethod?: OnlinePayment | null }) {
  return checkout.paymentMethod === "ONLINE" && checkout.onlineMethod ? ONLINE_LABEL[checkout.onlineMethod] : PAYMENT_LABEL[checkout.paymentMethod];
}

export function paymentStatusLabel(method: PaymentMethod, status: PaymentStatus) {
  if (status === "PAID") return "Paid";
  if (status === "FAILED") return "Payment failed";
  if (status === "REFUNDED") return "Refunded";
  return method === "COD" ? "Pay when you receive it" : "Processing";
}

/** A receipt exists once the food changed hands, or once an online payment went through. */
export function hasReceipt(order: { status: OrderStatus; checkout: { paymentStatus: PaymentStatus } }) {
  if (order.status === "DELIVERED" || order.status === "COMPLETED") return true;
  return order.checkout.paymentStatus === "PAID" && order.status !== "REJECTED" && order.status !== "CANCELLED";
}

/** "2× Chicken Adobo, 1× Rice" and "+2 more" past the first few */
export function itemsSummary(items: { name: string; quantity: number }[], shown = 2) {
  const head = items.slice(0, shown).map((i) => `${i.quantity}× ${i.name}`).join(", ");
  return items.length > shown ? `${head} +${items.length - shown} more` : head;
}

/** A rider's delivery as steps: from accepting the job to handing it over. */
export function deliverySteps(status: OrderStatus) {
  const steps = ["Accepted", "Ready", "Picked up", "Delivered"];
  const at: Partial<Record<OrderStatus, number>> = { ACCEPTED: 0, PREPARING: 0, READY: 1, PICKED_UP: 2, DELIVERED: 3 };
  return { steps, done: at[status] ?? 0 };
}

/** For a rider: whether to collect cash at the door, or the order is already paid. */
export function riderPayment(checkout: { paymentMethod: PaymentMethod; onlineMethod?: OnlinePayment | null; paymentStatus: PaymentStatus }) {
  const cash = checkout.paymentMethod === "COD" && checkout.paymentStatus !== "PAID";
  return { cash, label: cash ? "Cash on delivery" : `Paid · ${paymentName(checkout)}` };
}
