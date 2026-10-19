import { Router } from "express";
import { prisma } from "../lib/db.js";
import { HttpError } from "../lib/http.js";
import { broadcastOrder, refreshStoreCache, restoreStock, settlePayment, transition } from "../lib/orders.js";
import { notify } from "../lib/realtime.js";
import { redis } from "../lib/redis.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** A resident's own orders. */
export const ordersRouter = Router();
ordersRouter.use(requireAuth, requireRole("RESIDENT"));

const orderInclude = {
  vendor: { select: { id: true, name: true, address: true, imageUrl: true, owner: { select: { phone: true } } } },
  items: { select: { id: true, name: true, unitPrice: true, quantity: true } },
  rider: { select: { name: true, phone: true, riderProfile: { select: { vehicleType: true, plateNumber: true } } } },
  checkout: { select: { id: true, paymentMethod: true, paymentStatus: true, deliveryAddress: true, notes: true, total: true, createdAt: true } },
} as const;

ordersRouter.get("/", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { checkout: { residentId: req.session!.userId } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: orderInclude,
  });
  res.json({ orders });
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: String(req.params.id), checkout: { residentId: req.session!.userId } },
    include: orderInclude,
  });
  if (!order) throw new HttpError(404, "Order not found.");
  // The rider's last known position, kept in Redis while they deliver
  const location = order.status === "PICKED_UP" ? await redis.get(`rider-location:${order.id}`) : null;
  res.json({ order, riderLocation: location ? JSON.parse(location) : null });
});

/** Residents can cancel until the store accepts. If both happen at once, only one wins. */
ordersRouter.post("/:id/cancel", async (req, res) => {
  const id = String(req.params.id);
  const order = await prisma.order.findFirst({
    where: { id, checkout: { residentId: req.session!.userId } },
    select: { checkoutId: true, vendor: { select: { ownerId: true, name: true } } },
  });
  if (!order) throw new HttpError(404, "Order not found.");

  const vendorId = await prisma.$transaction(async (tx) => {
    await transition(tx, id, ["PLACED", "AWAITING_PAYMENT"], "CANCELLED", { finishedAt: new Date(), rejectReason: "Cancelled by the resident" });
    const restored = await restoreStock(tx, id);
    await settlePayment(tx, order.checkoutId);
    return restored;
  }).catch((error) => {
    if (error instanceof HttpError && error.status === 409) {
      throw new HttpError(409, "The store already accepted this order, so it can't be cancelled.");
    }
    throw error;
  });

  await refreshStoreCache(vendorId);
  await notify(order.vendor.ownerId, { title: "An order was cancelled", body: "The resident cancelled before you accepted it.", link: "/vendor/orders" });
  await broadcastOrder(id);
  res.json({ ok: true });
});
