import { redis } from "./redis.js";

const MAX_FAILED_LOGINS = 5;
const WINDOW_SECONDS = 15 * 60;

/**
 * Failed login attempts are counted in Redis rather than in each API copy's memory.
 * Nginx spreads requests across api-1, api-2 and api-3, so a per-copy counter would
 * let an attacker make 3x the attempts; the shared counter sees all of them.
 */
const key = (email: string) => `login-failures:${email}`;

/** Seconds until the user may try again, or 0 if they are not locked out. */
export async function loginLockSeconds(email: string) {
  const failures = Number(await redis.get(key(email)));
  if (failures < MAX_FAILED_LOGINS) return 0;
  return Math.max(await redis.ttl(key(email)), 1);
}

export async function recordFailedLogin(email: string) {
  // INCR is atomic, so simultaneous failures on different API copies are all counted
  const failures = await redis.incr(key(email));
  if (failures === 1) await redis.expire(key(email), WINDOW_SECONDS);
}

export async function clearFailedLogins(email: string) {
  await redis.del(key(email));
}
