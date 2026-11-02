import { Router } from "express";
import { z } from "zod";
import { ACTIVE_STORE } from "../lib/accounts.js";
import { CACHE_KEYS, cached } from "../lib/cache.js";
import { prisma } from "../lib/db.js";
import { bboxQuery, distanceKm, inBbox, nearQuery, nextOffset, pageQuery, type LatLng } from "../lib/geo.js";
import { HttpError, parseBody } from "../lib/http.js";
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
  latitude: true,
  longitude: true,
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

type CachedStore = Awaited<ReturnType<typeof loadStoreList>>[number];
type Summary = ReturnType<typeof summarize>;

/** Measured from the lat/lng in the request, else the resident's default delivery address. */
async function startingPoint(userId: string, lat?: number, lng?: number): Promise<LatLng | null> {
  if (lat !== undefined && lng !== undefined) return { lat, lng };
  const address = await prisma.address.findFirst({ where: { userId, isDefault: true }, select: { latitude: true, longitude: true } });
  return address?.latitude != null && address.longitude != null ? { lat: address.latitude, lng: address.longitude } : null;
}

/** What the browser gets for one store: open or not, saved or not, how far, and dishes matching a search. */
function summarize({ dishes, ...store }: CachedStore, saved: Set<string>, from: LatLng | null, needle?: string) {
  return {
    ...store,
    matchedDishes: needle ? dishes.filter((d) => d.toLowerCase().includes(needle)).slice(0, 3) : [],
    isOpen: isStoreOpen(store),
    isFavorite: saved.has(store.id),
    distanceKm: from && store.latitude != null && store.longitude != null ? distanceKm(from, { lat: store.latitude, lng: store.longitude }) : null,
  };
}

const SORTS = {
  nearest: (a: Summary, b: Summary) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name),
  // Unrated stores last; among equal stars, the one more people rated
  rating: (a: Summary, b: Summary) => (b.rating ?? -1) - (a.rating ?? -1) || b.ratingCount - a.ratingCount || a.name.localeCompare(b.name),
  name: (a: Summary, b: Summary) => a.name.localeCompare(b.name),
};
/** Open stores always come first: a closed one can't take the order right now. */
const openFirst = (sort: keyof typeof SORTS) => (a: Summary, b: Summary) => Number(b.isOpen) - Number(a.isOpen) || SORTS[sort](a, b);

const listQuery = z.object({
  type: z.enum(STORE_TYPES).optional(),
  q: z.string().trim().max(60).optional(),
  reservations: z.literal("1").optional(),
  favorites: z.literal("1").optional(),
  open: z.literal("1").optional(),
  /** Defaults to nearest when there's a starting point, else A to Z */
  sort: z.enum(["nearest", "rating", "name"]).optional(),
  bbox: bboxQuery,
  ...nearQuery,
  ...pageQuery(20, 200),
});

/**
 * Stores, one page at a time. The whole list sits in the shared Redis cache, so filtering,
 * sorting and slicing it here costs no database query; the browser only gets one page.
 */
storesRouter.get("/", async (req, res) => {
  const { type, q, reservations, favorites, open, sort, bbox, lat, lng, limit, offset } = parseBody(listQuery, req.query);
  const userId = req.session!.userId;
  const [all, saved, from] = await Promise.all([
    cached(CACHE_KEYS.storeList, CACHE_SECONDS, loadStoreList),
    favoriteIds(userId),
    startingPoint(userId, lat, lng),
  ]);
  const needle = q?.toLowerCase();

  const matching = all
    .filter((s) => !type || s.storeType === type)
    .filter((s) => !reservations || s.acceptsReservations)
    .filter((s) => !favorites || saved.has(s.id))
    .filter((s) => !bbox || (s.latitude != null && s.longitude != null && inBbox(bbox, s.latitude, s.longitude)))
    .map((s) => summarize(s, saved, from, needle))
    .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.matchedDishes.length > 0)
    .filter((s) => !open || s.isOpen)
    .sort(openFirst(sort ?? (from ? "nearest" : "name")));

  const stores = matching.slice(offset, offset + limit);
  res.json({
    stores,
    total: matching.length,
    nextOffset: nextOffset(offset, stores.length, matching.length),
    openCount: matching.filter((s) => s.isOpen).length,
    favoriteCount: saved.size,
  });
});

const SECTION_SIZE = 8;

/**
 * The resident's home screen in one request: a few stores per row (order again, near you,
 * top rated, saved) instead of the whole list. "See all" opens the full, paged list.
 */
storesRouter.get("/sections", requireRole("RESIDENT"), async (req, res) => {
  const userId = req.session!.userId;
  const [all, saved, from, recent] = await Promise.all([
    cached(CACHE_KEYS.storeList, CACHE_SECONDS, loadStoreList),
    favoriteIds(userId),
    startingPoint(userId),
    // The stores of the latest finished orders, newest first, once each
    prisma.order.findMany({
      where: { checkout: { residentId: userId }, status: { in: ["DELIVERED", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      distinct: ["vendorId"],
      take: SECTION_SIZE,
      select: { vendorId: true },
    }),
  ]);
  const stores = all.map((s) => summarize(s, saved, from));
  const byId = new Map(stores.map((s) => [s.id, s]));

  res.json({
    orderAgain: recent.flatMap((order) => byId.get(order.vendorId) ?? []),
    nearby: [...stores].sort(openFirst(from ? "nearest" : "name")).slice(0, SECTION_SIZE),
    topRated: stores.filter((s) => s.rating !== null).sort(openFirst("rating")).slice(0, SECTION_SIZE),
    saved: stores.filter((s) => s.isFavorite).sort(openFirst("name")).slice(0, SECTION_SIZE),
    total: stores.length,
    openCount: stores.filter((s) => s.isOpen).length,
    savedCount: saved.size,
    hasStartingPoint: from !== null,
  });
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
