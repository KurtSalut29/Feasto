import { DoorClosed, Hash, PencilLine, UtensilsCrossed } from "lucide-react";
import { formatClock } from "@/lib/format";
import type { VendorOrder } from "@/lib/types";

/**
 * What the kitchen and the counter need to see at a glance: the pickup code the rider says, no
 * spoon and fork, "leave it at the gate", and whether the customer changed the order.
 */
export function OrderFlags({ order }: { order: Pick<VendorOrder, "pickupCode" | "editedAt" | "fulfillment" | "checkout"> }) {
  const { noCutlery, leaveAtGate } = order.checkout;
  if (!order.pickupCode && !noCutlery && !leaveAtGate && !order.editedAt) return null;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {order.pickupCode && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 font-semibold text-brand-800 ring-1 ring-brand-100">
          <Hash className="size-4" aria-hidden />
          {order.fulfillment === "DELIVERY" ? "Rider's code" : "Pickup code"} <span className="font-mono tracking-widest">{order.pickupCode}</span>
        </span>
      )}
      {noCutlery && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-100">
          <UtensilsCrossed className="size-4" aria-hidden />
          No spoon and fork
        </span>
      )}
      {leaveAtGate && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-800 ring-1 ring-sky-100">
          <DoorClosed className="size-4" aria-hidden />
          Leave at the gate
        </span>
      )}
      {order.editedAt && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">
          <PencilLine className="size-4" aria-hidden />
          Changed by the customer at {formatClock(order.editedAt)}
        </span>
      )}
    </div>
  );
}
