import { prisma } from "./db.js";
import { redis } from "./redis.js";

/**
 * Disabled accounts. Logins are stateless signed cookies, so a cookie stays valid until it
 * expires. To log a disabled user out everywhere at once, every API copy checks this shared
 * Redis set on each request. The database (User.disabledAt) is the source of truth; the set
 * is rebuilt from it whenever an API copy starts.
 */
const DISABLED_SET = "accounts:disabled";

export async function isDisabled(userId: string) {
  return (await redis.sismember(DISABLED_SET, userId)) === 1;
}

export async function markDisabled(userId: string, disabled: boolean) {
  if (disabled) await redis.sadd(DISABLED_SET, userId);
  else await redis.srem(DISABLED_SET, userId);
}

export async function syncDisabledAccounts() {
  const users = await prisma.user.findMany({ where: { disabledAt: { not: null } }, select: { id: true } });
  const multi = redis.multi().del(DISABLED_SET);
  if (users.length) multi.sadd(DISABLED_SET, ...users.map((u) => u.id));
  await multi.exec();
}

/** A store residents can see and order from: approved, and its owner's account isn't disabled. */
export const ACTIVE_STORE = { status: "APPROVED", owner: { disabledAt: null } } as const;
