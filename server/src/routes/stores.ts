import { Router } from "express";
import { z } from "zod";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { CACHE_KEYS, cached } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { HttpError } from "../lib/http.js";
import { isStoreOpen } from "../lib/storeHours.js";
import { STORE_TYPES } from "../lib/storeTypes.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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
  ratingSum: true,
  ratingCount: true,
} as const;

/** Average stars rounded to one decimal, or null before the first rating. */
function withRating<T extends { ratingSum: number; ratingCount: number }>({ ratingSum, ratingCount, ...store }: T) {
  return { ...store, rating: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null, ratingCount };
}

/** The ids of the stores this user saved. Per user, so it isn't part of the shared cache. */
async function favoriteIds(userId: string) {
  const rows = await prisma.favorite.findMany({ where: { userId }, select: { vendorId: true } });
  return new Set(rows.map((r) => r.vendorId));
}

async function loadStoreList() {
  const stores = await prisma.vendor.findMany({
    where: ACTIVE_STORE,
    select: {
      ...storeFields,
      menuItems: { where: { deletedAt: null, isAvailable: true }, select: { name: true, category: true } },
    },
  });
  return stores.map(({ menuItems, ...store }) => ({
    ...withRating(store),
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
  favorites: z.literal("1").optional(),
});

storesRouter.get("/", async (req, res) => {
  const { type, q, reservations, favorites } = listQuery.parse(req.query);
  const [all, saved] = await Promise.all([cached(CACHE_KEYS.storeList, CACHE_SECONDS, loadStoreList), favoriteIds(req.session!.userId)]);
  const needle = q?.toLowerCase();

  const stores = all
    .filter((s) => !type || s.storeType === type)
    .filter((s) => !reservations || s.acceptsReservations)
    .filter((s) => !favorites || saved.has(s.id))
    .map(({ dishes, ...store }) => {
      const matchedDishes = needle ? dishes.filter((d) => d.toLowerCase().includes(needle)).slice(0, 3) : [];
      const matches = !needle || store.name.toLowerCase().includes(needle) || matchedDishes.length > 0;
      return matches ? { ...store, matchedDishes, isOpen: isStoreOpen(store), isFavorite: saved.has(store.id) } : null;
    })
    .filter((s) => s !== null)
    // Open stores first, then alphabetically
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || a.name.localeCompare(b.name));

  res.json({ stores, favoriteCount: saved.size });
});

storesRouter.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const store = await cached(CACHE_KEYS.store(id), CACHE_SECONDS, () =>
    prisma.vendor.findFirst({
      where: { id, ...ACTIVE_STORE },
      select: {
        ...storeFields,
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, rating: true, comment: true, createdAt: true, resident: { select: { name: true } } },
        },
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

  const { tables, reviews, ...rest } = store;
  const saved = await prisma.favorite.findUnique({ where: { userId_vendorId: { userId: req.session!.userId, vendorId: id } } });
  res.json({
    store: {
      ...withRating(rest),
      isFavorite: saved !== null,
      // First name and last initial only, e.g. "Juan D."
      reviews: reviews.map(({ resident, ...review }) => ({ ...review, author: shortName(resident.name) })),
      isOpen: isStoreOpen(store),
      // Bookings need at least one table set up
      canBook: store.acceptsReservations && tables.length > 0,
      maxPartySize: Math.max(0, ...tables.map((t) => t.seats)),
    },
  });
});

function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

// ---------- Favorites (residents) ----------

storesRouter.put("/:id/favorite", requireRole("RESIDENT"), async (req, res) => {
  const vendorId = String(req.params.id);
  const store = await prisma.vendor.findFirst({ where: { id: vendorId, ...ACTIVE_STORE }, select: { id: true } });
  if (!store) throw new HttpError(404, "This store isn't available.");
  // upsert: saving twice (e.g. a double tap) is harmless
  await prisma.favorite.upsert({
    where: { userId_vendorId: { userId: req.session!.userId, vendorId } },
    create: { userId: req.session!.userId, vendorId },
    update: {},
  });
  res.json({ isFavorite: true });
});

storesRouter.delete("/:id/favorite", requireRole("RESIDENT"), async (req, res) => {
  await prisma.favorite.deleteMany({ where: { userId: req.session!.userId, vendorId: String(req.params.id) } });
  res.json({ isFavorite: false });
});
