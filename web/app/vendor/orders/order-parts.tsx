import { UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { formatPeso } from "@/lib/format";
import { paymentName } from "@/lib/order-status";
import type { VendorOrder } from "@/lib/types";

/** A dish's photo from the menu, small, so the kitchen knows it at a glance */
export function DishThumb({ src, className = "size-9" }: { src: string | null | undefined; className?: string }) {
  return src ? (
    <Image src={src} alt="" width={40} height={40} unoptimized className={`${className} shrink-0 rounded-lg object-cover`} />
  ) : (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600/60`} aria-hidden>
      <UtensilsCrossed className="size-4" />
    </span>
  );
}

/** What the customer pays and how, in the store's words */
export function paymentLine(order: Pick<VendorOrder, "fulfillment" | "subtotal" | "deliveryFee" | "checkout">) {
  const delivery = order.fulfillment === "DELIVERY";
  const total = Number(order.subtotal) + (delivery ? Number(order.deliveryFee) : 0);
  if (order.checkout.paymentStatus === "PAID") return { tone: "paid" as const, text: `Paid · ${paymentName(order.checkout)}`, total };
  if (order.checkout.paymentStatus === "REFUNDED") return { tone: "cash" as const, text: `Refunded · ${paymentName(order.checkout)}`, total };
  if (order.checkout.paymentMethod === "COD")
    return { tone: "cash" as const, text: delivery ? `Cash · the rider collects ${formatPeso(total)}` : `Cash · collect ${formatPeso(total)} at pickup`, total };
  return { tone: "cash" as const, text: `${paymentName(order.checkout)} · waiting for payment`, total };
}
