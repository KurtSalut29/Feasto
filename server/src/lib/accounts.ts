import { SESSION_DAYS } from "./auth.js";
import { prisma } from "./db.js";
import { redis } from "./redis.js";

/**
 * Disabled accounts. Logins are stateless signed cookies, so a cookie stays valid until it
 * expires. To log a disabled user out everywhere at once, every API copy checks this shared
 * Redis set on each request. The database (User.disabledAt) is the source of truth; the set
 * is rebuilt from it whenever an API copy starts. Password changes work the same way, below.
 */
const DISABLED_SET = "accounts:disabled";

/**
 * Password changes. Like disabled accounts, a new password must end the old cookies on every
 * device, so this shared Redis hash keeps userId -> when the password last changed (Unix milliseconds).
 * A cookie signed before that moment is refused. Entries only matter for the cookie lifetime.
 */
const PASSWORD_CHANGED = "accounts:password-changed";

/** Why a still-valid cookie is no longer accepted, or null when it is. Both checks in one Redis round trip. */
export async function sessionRevoked(userId: string, issuedAt: number): Promise<"disabled" | "password-changed" | null> {
  const [[, disabled], [, changedAt]] = (await redis.multi().sismember(DISABLED_SET, userId).hget(PASSWORD_CHANGED, userId).exec()) as [
    [unknown, number],
    [unknown, string | null],
  ];
  if (disabled === 1) return "disabled";
  return changedAt !== null && issuedAt < Number(changedAt) ? "password-changed" : null;
}

export async function markPasswordChanged(userId: string, at: Date) {
  await redis.hset(PASSWORD_CHANGED, userId, at.getTime());
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

export async function syncPasswordChanges() {
  const since = new Date(Date.now() - SESSION_DAYS * 24 * 3600_000);
  const users = await prisma.user.findMany({ where: { passwordChangedAt: { gte: since } }, select: { id: true, passwordChangedAt: true } });
  const multi = redis.multi().del(PASSWORD_CHANGED);
  for (const user of users) multi.hset(PASSWORD_CHANGED, user.id, user.passwordChangedAt!.getTime());
  await multi.exec();
}

/** A store residents can see and order from: approved, and its owner's account isn't disabled. */
export const ACTIVE_STORE = { status: "APPROVED", owner: { disabledAt: null } } as const;
