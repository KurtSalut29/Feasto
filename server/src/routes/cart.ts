import { Router } from "express";
import { z } from "zod";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { buildCart, clearCart, readCartQuantities, setCartQuantity } from "../lib/cart.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const cartRouter = Router();
cartRouter.use(requireAuth, requireRole("RESIDENT"));

cartRouter.get("/", async (req, res) => {
  res.json({ cart: await buildCart(req.session!.userId) });
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

cartRouter.delete("/", async (req, res) => {
  await clearCart(req.session!.userId);
  res.status(204).end();
});
