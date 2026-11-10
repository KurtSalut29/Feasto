import type { OnlinePayment } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { quoteDelivery, type DeliveryQuote } from "./deliveryFee.js";
import { redis } from "./redis.js";
import { getSettings } from "./settings.js";
import { isStoreOpen } from "./storeHours.js";

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

/** Where the cart would be delivered: the address asked for, else the default one, else the first */
async function deliveryAddress(userId: string, addressId?: string) {
  const select = { id: true, label: true, latitude: true, longitude: true } as const;
  if (addressId) return prisma.address.findFirst({ where: { id: addressId, userId }, select });
  return prisma.address.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], select });
}

/**
 * The cart with current prices, grouped by store, and anything that would stop checkout.
 * Each store's delivery fee is priced for the distance from it to `addressId` (or the
 * resident's default address).
 */
export async function buildCart(userId: string, addressId?: string) {
  const lines = await readCartQuantities(userId);
  const settings = await getSettings();
  const empty = { addressId: null, addressLabel: null, total: 0, baseFee: settings.deliveryFee };
  if (lines.length === 0) return { groups: [], itemCount: 0, itemsTotal: 0, delivery: empty, hasProblems: false };

  const items = await prisma.menuItem.findMany({
    where: { id: { in: lines.map((l) => l.menuItemId) } },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          address: true,
          latitude: true,
          longitude: true,
          status: true,
          opensAt: true,
          closesAt: true,
          isTemporarilyClosed: true,
          acceptsCash: true,
          onlinePayments: true,
          owner: { select: { disabledAt: true } },
        },
      },
    },
  });

  // Dishes that were deleted since they were added are dropped quietly
  const gone = lines.filter((l) => !items.some((i) => i.id === l.menuItemId && !i.deletedAt));
  if (gone.length) await redis.hdel(key(userId), ...gone.map((g) => g.menuItemId));

  const groups = new Map<string, {
    store: { id: string; name: string; imageUrl: string | null; address: string; opensAt: string; isOpen: boolean; acceptsCash: boolean; onlinePayments: OnlinePayment[] };
    items: { menuItemId: string; name: string; imageUrl: string | null; price: number; quantity: number; lineTotal: number; problem: CartProblem | null; stock: number | null }[];
    subtotal: number;
    problem: CartProblem | null;
    /** This store's delivery fee to the address, with how it was worked out; null without an address */
    delivery: DeliveryQuote | null;
    pin: { latitude: number | null; longitude: number | null };
  }>();

  for (const item of items) {
    if (item.deletedAt) continue;
    const quantity = lines.find((l) => l.menuItemId === item.id)!.quantity;
    const open = isStoreOpen(item.vendor);
    let group = groups.get(item.vendorId);
    if (!group) {
      group = {
        store: { id: item.vendor.id, name: item.vendor.name, imageUrl: item.vendor.imageUrl, address: item.vendor.address, opensAt: item.vendor.opensAt, isOpen: open, acceptsCash: item.vendor.acceptsCash, onlinePayments: item.vendor.onlinePayments },
        items: [],
        subtotal: 0,
        problem: item.vendor.status !== "APPROVED" || item.vendor.owner.disabledAt ? "STORE_UNAVAILABLE" : open ? null : "STORE_CLOSED",
        delivery: null,
        pin: { latitude: item.vendor.latitude, longitude: item.vendor.longitude },
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

  // Price each store's delivery for the distance to the address (looked up in parallel)
  const address = await deliveryAddress(userId, addressId);
  if (address) {
    const now = new Date();
    const quotes = await Promise.all(list.map((g) => quoteDelivery(g.pin, address, settings, now)));
    list.forEach((g, i) => (g.delivery = quotes[i]!));
  }

  return {
    groups: list.map(({ pin: _pin, ...group }) => group),
    itemCount: list.reduce((n, g) => n + g.items.reduce((m, i) => m + i.quantity, 0), 0),
    itemsTotal: list.reduce((n, g) => n + g.subtotal, 0),
    delivery: {
      addressId: address?.id ?? null,
      addressLabel: address?.label ?? null,
      total: Math.round(list.reduce((n, g) => n + (g.delivery?.fee ?? 0), 0) * 100) / 100,
      baseFee: settings.deliveryFee,
    },
    hasProblems: list.some((g) => g.problem || g.items.some((i) => i.problem)),
  };
}
