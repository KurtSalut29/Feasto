import type { Prisma } from "../generated/prisma/client.js";
import { logActivity } from "./activity.js";
import { prisma } from "./db.js";
import { OPEN_JOB } from "./dispatch.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { broadcastOrder, orderCode, refreshStoreCache, restoreStock, settlePayment, transition } from "./orders.js";
import { getSettings } from "./settings.js";

/**
 * Orders nobody took are cancelled by themselves, so they don't sit stuck and the admin doesn't
 * have to step in:
 *
 *  - the store didn't accept the order within `autoCancelMinutes` of it being placed, or
 *  - no rider took a delivery within `autoCancelMinutes` of the store accepting it.
 *
 * The stock goes back, an online payment is refunded, and both the resident and the store are told
 * why. Orders a rider already holds are never cancelled here (the food is with the rider); those
 * still go to the admin as stuck orders. Every worker runs this; the conditional update in
 * `transition` lets only one of them cancel each order.
 */

type Why = "NO_STORE_REPLY" | "NO_RIDER";

/** When an order that's still waiting will be cancelled, or null if it won't be */
export function autoCancelAt(
  order: { status: string; fulfillment: string; riderId: string | null; createdAt: Date; acceptedAt: Date | null },
  minutes: number,
): { at: Date; why: Why } | null {
  if (!minutes) return null;
  if (order.status === "PLACED") return { at: new Date(order.createdAt.getTime() + minutes * 60_000), why: "NO_STORE_REPLY" };
  if (order.fulfillment === "DELIVERY" && !order.riderId && OPEN_JOB.includes(order.status as never) && order.acceptedAt) {
    return { at: new Date(order.acceptedAt.getTime() + minutes * 60_000), why: "NO_RIDER" };
  }
  return null;
}

function staleWhere(minutes: number, now: number): Prisma.OrderWhereInput {
  const since = new Date(now - minutes * 60_000);
  return {
    OR: [
      { status: "PLACED", createdAt: { lt: since } },
      { fulfillment: "DELIVERY", riderId: null, status: { in: OPEN_JOB }, acceptedAt: { lt: since } },
    ],
  };
}

export async function autoCancelStaleOrders(log: (...args: unknown[]) => void) {
  const { autoCancelMinutes: minutes } = await getSettings();
  if (!minutes) return 0;

  const orders = await prisma.order.findMany({
    where: staleWhere(minutes, Date.now()),
    select: {
      id: true,
      status: true,
      checkoutId: true,
      vendor: { select: { name: true, ownerId: true } },
      checkout: { select: { residentId: true, paymentMethod: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  let cancelled = 0;
  for (const order of orders) {
    const why: Why = order.status === "PLACED" ? "NO_STORE_REPLY" : "NO_RIDER";
    const code = orderCode(order.id);
    const store = order.vendor.name;
    const reason =
      why === "NO_STORE_REPLY"
        ? `${store} didn't accept it within ${minutes} minutes`
        : `No rider was free to deliver it within ${minutes} minutes`;

    let refunded = false;
    let vendorId: string | undefined;
    try {
      vendorId = await prisma.$transaction(async (tx) => {
        // Only if it's still waiting: a store or rider who acts at the last second wins
        await transition(
          tx,
          order.id,
          why === "NO_STORE_REPLY" ? ["PLACED"] : OPEN_JOB,
          "CANCELLED",
          { finishedAt: new Date(), rejectReason: `Cancelled automatically: ${reason}.`, nextDispatchAt: null },
          why === "NO_RIDER" ? { riderId: null } : {},
        );
        const restored = await restoreStock(tx, order.id);
        await settlePayment(tx, order.checkoutId);
        refunded = (await tx.checkout.findUnique({ where: { id: order.checkoutId }, select: { paymentStatus: true } }))?.paymentStatus === "REFUNDED";
        await logActivity(tx, null, { category: "ORDERS", action: "Cancelled an order automatically", target: `${code} from ${store}`, detail: `${reason}.` });
        return restored;
      });
    } catch (error) {
      if (error instanceof HttpError) continue; // someone acted on it first, or another worker cancelled it
      throw error;
    }

    cancelled++;
    await refreshStoreCache(vendorId);
    const paid =
      order.checkout.paymentMethod === "COD"
        ? "You won't pay anything for it."
        : refunded
          ? "Your online payment was refunded."
          : "Your payment for it will be refunded.";
    await notify(order.checkout.residentId, {
      title: `Order ${code} was cancelled`,
      body:
        why === "NO_STORE_REPLY"
          ? `${store} didn't accept it within ${minutes} minutes, so we cancelled it for you. ${paid} You can order from another store.`
          : `No rider was free to deliver it within ${minutes} minutes, so we cancelled it. ${paid} You can try again, or choose Pickup.`,
      link: `/resident/orders/${order.id}`,
    });
    await notify(order.vendor.ownerId, {
      title: `${code} was cancelled automatically`,
      body:
        why === "NO_STORE_REPLY"
          ? `It wasn't accepted within ${minutes} minutes, so the resident was told and the stock was put back. Accept new orders sooner so they aren't cancelled.`
          : `No rider took it within ${minutes} minutes, so the resident was told. You can stop preparing it.`,
      link: "/vendor/orders",
    });
    await broadcastOrder(order.id);
    log(`order ${code} cancelled automatically: ${reason}`);
  }
  return cancelled;
}
