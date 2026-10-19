import type { BadgeTone } from "@/components/ui/badge";
import type { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

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

export function paymentStatusLabel(method: PaymentMethod, status: PaymentStatus) {
  if (status === "PAID") return "Paid";
  if (status === "FAILED") return "Payment failed";
  if (status === "REFUNDED") return "Refunded";
  return method === "COD" ? "Pay when you receive it" : "Processing";
}
