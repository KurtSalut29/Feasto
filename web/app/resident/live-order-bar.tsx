import { serverApi } from "@/lib/server-api";
import type { OrderStatus, OrdersSummary } from "@/lib/types";
import { LiveOrderBarView, type LiveOrder } from "./live-order-bar-view";

/** A scheduled order isn't followed here until its store gets it (then it's PLACED) */
const IN_PROGRESS: OrderStatus[] = ["AWAITING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY", "PICKED_UP"];
/** The order the resident most wants to follow: one on the road first, then the newest */
const URGENCY: OrderStatus[] = ["PICKED_UP", "READY", "PREPARING", "ACCEPTED", "PLACED", "AWAITING_PAYMENT"];

/**
 * A bar pinned above the bottom tabs on every resident page while an order is in progress,
 * saying what's happening and opening the live map. It refreshes with the page whenever the
 * order changes (the live connection refreshes the page on every order update).
 */
export async function LiveOrderBar() {
  // Only the orders in progress: this runs on every resident page, so it mustn't load the whole history
  const { active } = await serverApi<OrdersSummary>("/orders/summary");
  const live = active.filter((o) => IN_PROGRESS.includes(o.status));
  if (live.length === 0) return null;
  const order = [...live].sort((a, b) => URGENCY.indexOf(a.status) - URGENCY.indexOf(b.status))[0]!;

  const view: LiveOrder = {
    id: order.id,
    status: order.status,
    fulfillment: order.fulfillment,
    storeName: order.vendor.name,
    riderName: order.rider?.name.split(" ")[0] ?? null,
    others: live.length - 1,
  };
  return <LiveOrderBarView order={view} />;
}
