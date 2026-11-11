import type { Request, RequestHandler, Response } from "express";
import { HttpError } from "./http.js";
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

// ---------- Limits on how often something can be done ----------
//
// Fixed windows counted in Redis, so all three API copies share one count (a per-copy count would
// let someone do three times as much). INCR is atomic, and the window's clock starts with its
// first hit (EXPIRE … NX), so a busy key never lives forever.

/** Counts one more `key` in a window of `windowSeconds`; says whether it went over `limit`. */
export async function hit(key: string, limit: number, windowSeconds: number) {
  const [[, count], , [, ttl]] = (await redis.multi().incr(key).expire(key, windowSeconds, "NX").ttl(key).exec()) as [
    [unknown, number],
    unknown,
    [unknown, number],
  ];
  return { over: count > limit, retryAfter: Math.max(ttl, 1) };
}

/** Whether `key` is already at `limit`, without counting (for things only counted when they succeed). */
export async function atLimit(key: string, limit: number) {
  const [count, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
  return Number(count) >= limit ? Math.max(ttl, 1) : 0;
}

/**
 * The visitor's own address, or null when Feasto can't tell visitors apart by it. Caddy sends it
 * as X-Client-IP. On the classroom laptop every phone arrives from Docker's own gateway (Docker
 * Desktop doesn't pass the phones' addresses in), and a private address is never a reliable way
 * to tell people apart, so those count as unknown: limits by address then don't apply, and only
 * the limits by account and the overall ones do.
 */
export function clientIp(req: Request): string | null {
  const ip = String(req.headers["x-client-ip"] ?? "")
    .trim()
    .replace(/^::ffff:/, "");
  if (!ip || PRIVATE.some((range) => range.test(ip))) return null;
  return ip;
}

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80:/i];

/** "Try again in 2 minutes" for a wait in seconds */
export const waitWords = (seconds: number) => (seconds < 60 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minute${seconds > 60 ? "s" : ""}`);

/** Refuses with 429 and a Retry-After header (the app shows the message). */
export function tooMany(res: Response, retryAfter: number, what: string): never {
  res.setHeader("Retry-After", String(retryAfter));
  throw new HttpError(429, `${what} Try again in ${waitWords(retryAfter)}.`);
}

/**
 * A limit per signed-in account, for a route after requireAuth, e.g. 10 checkouts in 5 minutes:
 *   checkoutRouter.post("/", perAccount("checkout", 10, 300, "You've placed a lot of orders just now."), …)
 */
export function perAccount(name: string, limit: number, windowSeconds: number, what: string): RequestHandler {
  return async (req, res, next) => {
    const { over, retryAfter } = await hit(`rate:${name}:${req.session!.userId}`, limit, windowSeconds);
    if (over) tooMany(res, retryAfter, what);
    next();
  };
}
