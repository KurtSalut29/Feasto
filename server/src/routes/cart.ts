import { config } from "../config.js";
import { Router } from "express";
import { z } from "zod";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { buildCart, clearCart, ITEM_NOTE_MAX, readCartQuantities, setCartNote, setCartQuantity } from "../lib/cart.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const cartRouter = Router();
cartRouter.use(requireAuth, requireRole("RESIDENT"));

/**
 * `?addressId=` prices each store's delivery to that address (checkout, when the resident picks one).
 * `?at=` prices it for a scheduled time, when the rush-hour add-on may or may not apply.
 */
cartRouter.get("/", async (req, res) => {
  const addressId = typeof req.query.addressId === "string" && req.query.addressId ? req.query.addressId : undefined;
  const at = typeof req.query.at === "string" && !Number.isNaN(Date.parse(req.query.at)) ? new Date(req.query.at) : undefined;
  // The checkout page shows the "make the payment fail" demo switch only for simulated payments
  res.json({ cart: await buildCart(req.session!.userId, addressId, at), payments: config.payments });
});

/** A lighter call for the cart badge: just the number of items. */
cartRouter.get("/count", async (req, res) => {
  const lines = await readCartQuantities(req.session!.userId);
  res.json({ count: lines.reduce((n, l) => n + l.quantity, 0) });
});

const setSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(0).max(50, "You can order up to 50 of one dish."),
});

cartRouter.put("/items", async (req, res) => {
  const { menuItemId, quantity } = parseBody(setSchema, req.body);
  const userId = req.session!.userId;

  if (quantity > 0) {
    const item = await prisma.menuItem.findFirst({
      where: { id: menuItemId, deletedAt: null, vendor: ACTIVE_STORE },
      select: { isAvailable: true, stock: true, name: true },
    });
    if (!item) throw new HttpError(404, "This dish isn't available anymore.");
    if (!item.isAvailable || item.stock === 0) throw new HttpError(400, `${item.name} is sold out.`);
    if (item.stock !== null && quantity > item.stock) throw new HttpError(400, `Only ${item.stock} ${item.name} left.`);
  }

  await setCartQuantity(userId, menuItemId, quantity);
  res.json({ cart: await buildCart(userId) });
});

const noteSchema = z.object({ note: z.string().trim().max(ITEM_NOTE_MAX, `Keep it under ${ITEM_NOTE_MAX} characters.`) });

/** A note for one dish in the cart, for the store ("No onions", "Extra spicy"). An empty note removes it. */
cartRouter.put("/items/:menuItemId/note", async (req, res) => {
  const { note } = parseBody(noteSchema, req.body);
  const userId = req.session!.userId;
  const menuItemId = String(req.params.menuItemId);
  const inCart = (await readCartQuantities(userId)).some((l) => l.menuItemId === menuItemId);
  if (!inCart) throw new HttpError(404, "This dish isn't in your cart anymore.");
  await setCartNote(userId, menuItemId, note);
  res.json({ note: note || null });
});

cartRouter.delete("/", async (req, res) => {
  await clearCart(req.session!.userId);
  res.status(204).end();
});
