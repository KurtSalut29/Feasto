import { prisma } from "./db.js";
import { redis } from "./redis.js";
import { DELIVERY_FEE, isStoreOpen } from "./storeHours.js";

/**
 * The cart lives in Redis as a hash: menu item id -> quantity. Any API copy can read
 * or change it, so it doesn't matter which copy Nginx sends each click to.
 */
const key = (userId: string) => `cart:${userId}`;
const CART_DAYS = 7;

export async function readCartQuantities(userId: string) {
  const raw = await redis.hgetall(key(userId));
  return Object.entries(raw).map(([menuItemId, qty]) => ({ menuItemId, quantity: Number(qty) }));
}

export async function setCartQuantity(userId: string, menuItemId: string, quantity: number) {
  if (quantity <= 0) await redis.hdel(key(userId), menuItemId);
  else {
    await redis.hset(key(userId), menuItemId, quantity);
    await redis.expire(key(userId), CART_DAYS * 86400);
  }
}

export function clearCart(userId: string) {
  return redis.del(key(userId));
}

export type CartProblem = "SOLD_OUT" | "UNAVAILABLE" | "NOT_ENOUGH_STOCK" | "STORE_CLOSED" | "STORE_UNAVAILABLE";

/** The cart with current prices, grouped by store, and anything that would stop checkout. */
export async function buildCart(userId: string) {
  const lines = await readCartQuantities(userId);
  if (lines.length === 0) return { groups: [], itemCount: 0, itemsTotal: 0, deliveryFeePerStore: DELIVERY_FEE, hasProblems: false };

  const items = await prisma.menuItem.findMany({
    where: { id: { in: lines.map((l) => l.menuItemId) } },
    include: {
      vendor: {
        select: { id: true, name: true, imageUrl: true, status: true, opensAt: true, closesAt: true, isTemporarilyClosed: true, owner: { select: { disabledAt: true } } },
      },
    },
  });

  // Dishes that were deleted since they were added are dropped quietly
  const gone = lines.filter((l) => !items.some((i) => i.id === l.menuItemId && !i.deletedAt));
  if (gone.length) await redis.hdel(key(userId), ...gone.map((g) => g.menuItemId));

  const groups = new Map<string, {
    store: { id: string; name: string; imageUrl: string | null; isOpen: boolean };
    items: { menuItemId: string; name: string; imageUrl: string | null; price: number; quantity: number; lineTotal: number; problem: CartProblem | null; stock: number | null }[];
    subtotal: number;
    problem: CartProblem | null;
  }>();

  for (const item of items) {
    if (item.deletedAt) continue;
    const quantity = lines.find((l) => l.menuItemId === item.id)!.quantity;
    const open = isStoreOpen(item.vendor);
    let group = groups.get(item.vendorId);
    if (!group) {
      group = {
        store: { id: item.vendor.id, name: item.vendor.name, imageUrl: item.vendor.imageUrl, isOpen: open },
        items: [],
        subtotal: 0,
        problem: item.vendor.status !== "APPROVED" || item.vendor.owner.disabledAt ? "STORE_UNAVAILABLE" : open ? null : "STORE_CLOSED",
      };
      groups.set(item.vendorId, group);
    }
    const price = Number(item.price);
    const problem: CartProblem | null = !item.isAvailable
      ? "UNAVAILABLE"
      : item.stock === 0
        ? "SOLD_OUT"
        : item.stock !== null && quantity > item.stock
          ? "NOT_ENOUGH_STOCK"
          : null;
    group.items.push({ menuItemId: item.id, name: item.name, imageUrl: item.imageUrl, price, quantity, lineTotal: price * quantity, problem, stock: item.stock });
    group.subtotal += price * quantity;
  }

  const list = [...groups.values()].sort((a, b) => a.store.name.localeCompare(b.store.name));
  for (const group of list) group.items.sort((a, b) => a.name.localeCompare(b.name));
  return {
    groups: list,
    itemCount: list.reduce((n, g) => n + g.items.reduce((m, i) => m + i.quantity, 0), 0),
    itemsTotal: list.reduce((n, g) => n + g.subtotal, 0),
    deliveryFeePerStore: DELIVERY_FEE,
    hasProblems: list.some((g) => g.problem || g.items.some((i) => i.problem)),
  };
}
