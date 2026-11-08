import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { invalidateStore } from "../lib/cache.js";
import { ONLINE_PAYMENTS, storeRefusing } from "../lib/payments.js";
import { buildCart, clearCart } from "../lib/cart.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { enqueue } from "../lib/outbox.js";
import { QUEUES } from "../lib/queue.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const checkoutRouter = Router();
checkoutRouter.use(requireAuth, requireRole("RESIDENT"));

const checkoutSchema = z
  .object({
    /** Made once by the checkout page; a double-click or retry sends the same key */
    idempotencyKey: z.string().min(8).max(100),
    fulfillment: z.enum(["DELIVERY", "PICKUP"]),
    addressId: z.string().optional(),
    paymentMethod: z.enum(["COD", "ONLINE"]),
    /** The e-wallet or card, for online payments */
    onlineMethod: z.enum(ONLINE_PAYMENTS).optional(),
    notes: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || null),
    /** The fee the page showed. If the admin changed it since, the resident sees the new total first. */
    expectedDeliveryFee: z.number().optional(),
    /** Demo switch: make the simulated online payment fail to show the saga undoing the order */
    simulatePaymentFailure: z.boolean().optional(),
  })
  .refine((v) => v.fulfillment === "PICKUP" || v.addressId, { path: ["addressId"], message: "Choose where to deliver." });

const checkoutSummary = { id: true, orders: { select: { id: true } } } as const;

checkoutRouter.post("/", async (req, res) => {
  const input = parseBody(checkoutSchema, req.body);
  const userId = req.session!.userId;

  // Same key again (double-click, network retry): return the checkout we already made
  const existing = await prisma.checkout.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { ...checkoutSummary, residentId: true } });
  if (existing) {
    if (existing.residentId !== userId) throw new HttpError(409, "Please refresh the page and try again.");
    res.json({ checkoutId: existing.id, orderIds: existing.orders.map((o) => o.id), repeated: true });
    return;
  }

  const cart = await buildCart(userId);
  if (cart.groups.length === 0) throw new HttpError(400, "Your cart is empty.");
  if (cart.hasProblems) throw new HttpError(409, "Some items in your cart changed. Check your cart and try again.");

  // Each store chooses the ways to pay it takes; one payment covers the whole cart, so every store must take it
  const refusing = storeRefusing(cart.groups.map((g) => g.store), input.paymentMethod === "COD" ? "COD" : (input.onlineMethod ?? "ONLINE"));
  if (refusing) throw new HttpError(409, `${refusing.name} doesn't take ${input.paymentMethod === "COD" ? "cash" : "this way to pay"}. Choose another way to pay.`);

  let deliveryAddress: string | null = null;
  let deliveryPin: { deliveryLat: number | null; deliveryLng: number | null } = { deliveryLat: null, deliveryLng: null };
  if (input.fulfillment === "DELIVERY") {
    const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw new HttpError(400, "Choose where to deliver.");
    deliveryAddress = [address.details, address.landmark].filter(Boolean).join(" · ");
    deliveryPin = { deliveryLat: address.latitude, deliveryLng: address.longitude };
  }

  const deliveryFee = input.fulfillment === "DELIVERY" ? cart.deliveryFeePerStore : 0;
  if (input.fulfillment === "DELIVERY" && input.expectedDeliveryFee !== undefined && input.expectedDeliveryFee !== deliveryFee) {
    throw new HttpError(409, `The delivery fee is now ₱${deliveryFee} per store. Check the new total and place your order again.`);
  }
  const total = cart.itemsTotal + deliveryFee * cart.groups.length;

  try {
    const checkout = await prisma.$transaction(async (tx) => {
      // Reserve stock with a conditional update: it only succeeds while enough is left,
      // so two residents can't both buy the last plate, even through different API copies.
      for (const group of cart.groups) {
        for (const item of group.items) {
          if (item.stock === null) continue;
          const { count } = await tx.menuItem.updateMany({
            where: { id: item.menuItemId, stock: { gte: item.quantity }, deletedAt: null, isAvailable: true },
            data: { stock: { decrement: item.quantity } },
          });
          if (count === 0) throw new HttpError(409, `${item.name} just sold out. Check your cart and try again.`);
        }
      }

      const created = await tx.checkout.create({
        data: {
          residentId: userId,
          idempotencyKey: input.idempotencyKey,
          fulfillment: input.fulfillment,
          paymentMethod: input.paymentMethod,
          onlineMethod: input.paymentMethod === "ONLINE" ? (input.onlineMethod ?? null) : null,
          deliveryAddress,
          ...deliveryPin,
          notes: input.notes,
          total,
          // One order per store; online orders wait for the payment first
          orders: {
            create: cart.groups.map((group) => ({
              vendorId: group.store.id,
              fulfillment: input.fulfillment,
              status: input.paymentMethod === "ONLINE" ? "AWAITING_PAYMENT" : "PLACED",
              subtotal: group.subtotal,
              deliveryFee,
              items: {
                create: group.items.map((item) => ({
                  menuItemId: item.menuItemId,
                  name: item.name,
                  unitPrice: item.price,
                  quantity: item.quantity,
                })),
              },
            })),
          },
        },
        select: checkoutSummary,
      });

      if (input.paymentMethod === "ONLINE") {
        await enqueue(tx, QUEUES.paymentRequested, { checkoutId: created.id, simulateFailure: Boolean(input.simulatePaymentFailure) });
      } else {
        for (const order of created.orders) await enqueue(tx, QUEUES.ordersPlaced, { orderId: order.id });
      }
      return created;
    });

    await clearCart(userId);
    await Promise.all(cart.groups.map((g) => invalidateStore(g.store.id))); // stock changed
    res.status(201).json({ checkoutId: checkout.id, orderIds: checkout.orders.map((o) => o.id) });
  } catch (error) {
    // Two requests with the same key at the same moment: the unique index lets one in
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.checkout.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey }, select: checkoutSummary });
      res.json({ checkoutId: winner.id, orderIds: winner.orders.map((o) => o.id), repeated: true });
      return;
    }
    throw error;
  }
});
