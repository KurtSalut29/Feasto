import type { Role } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { forgetRiderPosition } from "./dispatch.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { invalidateStore } from "./redisCache.js";

/**
 * Reports: a resident, rider or store reports someone they dealt with on an order, Pabili or
 * booking. The admin dismisses it, warns the person (they read the warning once, after they sign
 * in), or suspends them for some days. A suspended person can still sign in and finish what they
 * started, but can't start anything new: a resident can't order, a rider can't go online or take
 * jobs, a store stops taking orders (like a permit pause). The worker lifts it when the time's up.
 */

/** "Until the admin lifts it": far enough away to never come by itself */
export const SUSPENDED_UNTIL_LIFTED = new Date("2999-12-31T00:00:00.000Z");
export const SUSPEND_DAY_CHOICES = [1, 3, 7, 30] as const;

export const isUntilLifted = (until: Date) => until.getUTCFullYear() >= 2999;

export const untilText = (until: Date) =>
  isUntilLifted(until) ? "until Feasto lifts it" : `until ${until.toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;

const BLOCKED: Record<"order" | "jobs" | "book" | "pabili", string> = {
  order: "You can't place orders",
  book: "You can't book a table",
  pabili: "You can't ask for a Pabili",
  jobs: "You can't go online or take jobs",
};

/** Stops a suspended person from starting something new, with when it ends */
export async function refuseIfSuspended(userId: string, what: keyof typeof BLOCKED) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedUntil: true } });
  if (user?.suspendedUntil && user.suspendedUntil > new Date()) {
    throw new HttpError(403, `Your account is suspended ${untilText(user.suspendedUntil)} because of a report. ${BLOCKED[what]} until then.`);
  }
}

/** What a suspension does right away, beyond the flag: a rider goes offline, a store's cached pages refresh */
export async function applySuspension(userId: string, role: Role) {
  if (role === "RIDER") {
    await prisma.riderProfile.updateMany({ where: { userId }, data: { isOnline: false } });
    await forgetRiderPosition(userId);
  }
  if (role === "VENDOR") {
    const store = await prisma.vendor.findUnique({ where: { ownerId: userId }, select: { id: true } });
    if (store) await invalidateStore(store.id);
  }
}

/** Lifts suspensions whose time is up. UPDATE ... RETURNING hands each to one worker, so each person is told once. */
export async function liftEndedSuspensions(log: (...args: unknown[]) => void) {
  const lifted = await prisma.$queryRaw<{ id: string; role: Role }[]>`
    UPDATE "User" SET "suspendedUntil" = NULL
    WHERE "suspendedUntil" IS NOT NULL AND "suspendedUntil" < NOW()
    RETURNING id, role`;
  for (const user of lifted) {
    if (user.role === "VENDOR") {
      // The store's pages show it taking orders again
      const store = await prisma.vendor.findUnique({ where: { ownerId: user.id }, select: { id: true } });
      if (store) await invalidateStore(store.id);
    }
    await notify(user.id, { title: "Your suspension ended", body: "You can use Feasto as usual again. Please follow the Terms so it doesn't happen again.", link: "/" });
    log(`suspension of ${user.id.slice(-6)} ended`);
  }
}
