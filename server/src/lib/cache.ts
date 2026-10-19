import { redis } from "./redis.js";

/**
 * Cache-aside: read from Redis, or load from the database and keep it for `ttlSeconds`.
 * The cache lives in Redis rather than in each API copy's memory, so all three copies
 * share it, and a change made through one copy is cleared for all of them at once.
 */
export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const value = await load();
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  return value;
}

export async function invalidate(...keys: string[]) {
  if (keys.length) await redis.del(...keys);
}

export const CACHE_KEYS = {
  /** Every approved store, used for browsing and search */
  storeList: "cache:stores:list",
  /** One store with its menu */
  store: (vendorId: string) => `cache:store:${vendorId}`,
};

/** Call after anything a resident would see about a store changes (details, menu, approval). */
export function invalidateStore(vendorId: string) {
  return invalidate(CACHE_KEYS.storeList, CACHE_KEYS.store(vendorId));
}
