import type { ActivityCategory, Prisma } from "../generated/prisma/client.js";
import { prisma } from "./db.js";
import { notify } from "./liveUpdates.js";

/** Who did something. Null means Feasto itself did it, like taking an expired license offline. */
export type Actor = { userId: string; name: string } | null;

type Entry = { category: ActivityCategory; action: string; target: string; detail?: string | null };

/**
 * Adds a line to the activity log. Pass the transaction that makes the change, so the change and
 * its record are saved together or not at all. Names are copied so the record never shifts later.
 * Nothing in the API edits or deletes these lines, and they never hold license or permit numbers.
 */
export function logActivity(db: Prisma.TransactionClient, actor: Actor, entry: Entry) {
  return db.activityLog.create({ data: { actorId: actor?.userId ?? null, actorName: actor?.name ?? "Feasto (automatic)", ...entry } });
}

/** Feasto has exactly one admin; the database guarantees it. */
export async function notifyAdmin(message: { title: string; body: string; link: string }) {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  if (admin) await notify(admin.id, message);
}
