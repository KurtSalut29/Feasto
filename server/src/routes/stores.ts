import { Router } from "express";
import { z } from "zod";
import { CACHE_KEYS, cached } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { HttpError } from "../lib/http.js";
import { isStoreOpen } from "../lib/storeHours.js";
import { STORE_TYPES } from "../lib/storeTypes.js";
import { requireAuth } from "../middleware/auth.js";

/** Browsing approved stores and their menus. Results are cached in Redis for all API copies. */
export const storesRouter = Router();
storesRouter.use(requireAuth);

const CACHE_SECONDS = 300;

const storeFields = {
  id: true,
  name: true,
  storeType: true,
  description: true,
  address: true,
  imageUrl: true,
  opensAt: true,
  closesAt: true,
  isTemporarilyClosed: true,
  acceptsReservations: true,
} as const;

async function loadStoreList() {
  const stores = await prisma.vendor.findMany({
    where: { status: "APPROVED" },
    select: {
      ...storeFields,
      menuItems: { where: { deletedAt: null, isAvailable: true }, select: { name: true, category: true } },
    },
  });
  return stores.map(({ menuItems, ...store }) => ({
    ...store,
    dishCount: menuItems.length,
    // Kept for searching by dish; not sent to the browser
    dishes: menuItems.map((item) => item.name),
    categories: [...new Set(menuItems.map((item) => item.category))],
  }));
}

const listQuery = z.object({
  type: z.enum(STORE_TYPES).optional(),
  q: z.string().trim().max(60).optional(),
  reservations: z.literal("1").optional(),
});

storesRouter.get("/", async (req, res) => {
  const { type, q, reservations } = listQuery.parse(req.query);
  const all = await cached(CACHE_KEYS.storeList, CACHE_SECONDS, loadStoreList);
  const needle = q?.toLowerCase();

  const stores = all
    .filter((s) => !type || s.storeType === type)
    .filter((s) => !reservations || s.acceptsReservations)
    .map(({ dishes, ...store }) => {
      const matchedDishes = needle ? dishes.filter((d) => d.toLowerCase().includes(needle)).slice(0, 3) : [];
      const matches = !needle || store.name.toLowerCase().includes(needle) || matchedDishes.length > 0;
      return matches ? { ...store, matchedDishes, isOpen: isStoreOpen(store) } : null;
    })
    .filter((s) => s !== null)
    // Open stores first, then alphabetically
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name));

  res.json({ stores });
});

storesRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const store = await cached(CACHE_KEYS.store(id), CACHE_SECONDS, () =>
    prisma.vendor.findFirst({
      where: { id, status: "APPROVED" },
      select: {
        ...storeFields,
        tables: { where: { isActive: true }, select: { seats: true } },
        menuItems: {
          where: { deletedAt: null },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          select: { id: true, name: true, category: true, description: true, price: true, imageUrl: true, stock: true, isAvailable: true },
        },
      },
    }),
  );
  if (!store) throw new HttpError(404, "This store isn't available.");

  const { tables, ...rest } = store;
  res.json({
    store: {
      ...rest,
      isOpen: isStoreOpen(store),
      // Bookings need at least one table set up
      canBook: store.acceptsReservations && tables.length > 0,
      maxPartySize: Math.max(0, ...tables.map((t) => t.seats)),
    },
  });
});
