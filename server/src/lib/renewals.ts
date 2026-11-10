import { rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config.js";
import { Prisma } from "../generated/prisma/client.js";
import { logActivity, type Actor } from "./activity.js";
import { prisma } from "./db.js";
import { HttpError } from "./http.js";
import { notify } from "./liveUpdates.js";

/** How long before the expiry date people are warned and the admin's monitor lists it. */
export const EXPIRING_SOON_DAYS = 30;

/** Today in Manila as a date, to compare with the DATE columns. */
export const manilaToday = () => new Date(`${new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)}T00:00:00Z`);

export const daysFromToday = (days: number) => new Date(manilaToday().getTime() + days * 86400_000);

/** A document is good through its expiry date and has expired from the day after. */
export const hasExpired = (date: Date | null) => date !== null && date < manilaToday();

export const removeDocument = (name: string | null | undefined) => (name ? rm(path.join(config.documentDir, name), { force: true }) : undefined);

export const renewalReviewSchema = z
  .object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(300).optional() })
  .refine((v) => v.decision === "APPROVED" || (v.note && v.note.length >= 3), {
    path: ["note"],
    message: "Give a short reason so they know what to fix.",
  });

/**
 * Accepts or refuses a renewed permit or license. The same people who approved the account decide:
 * the admin for stores and free riders, and a store for its own riders. Approving replaces the
 * document in one transaction, and the conditional update means a double-click only counts once.
 */
export async function reviewRenewal(id: string, { decision, note }: z.infer<typeof renewalReviewSchema>, by: { admin: true; actor: Actor } | { vendorId: string; actor: Actor }) {
  const renewal = await prisma.documentRenewal.findUnique({
    where: { id },
    select: {
      number: true,
      expiresAt: true,
      file: true,
      vendor: { select: { id: true, name: true, ownerId: true, permitFile: true, status: true } },
      rider: { select: { id: true, userId: true, vendorId: true, licenseFile: true, status: true, user: { select: { name: true } }, vendor: { select: { name: true } } } },
    },
  });
  const { vendor, rider } = renewal ?? {};
  if ("vendorId" in by) {
    if (!rider || rider.vendorId !== by.vendorId) throw new HttpError(404, "This renewal isn't from one of your riders.");
  } else {
    if (!renewal) throw new HttpError(404, "We couldn't find this renewal. It may have been reviewed already.");
    if (rider?.vendorId) throw new HttpError(403, `${rider.vendor?.name ?? "The rider's store"} reviews this rider's license.`);
  }
  const approved = decision === "APPROVED";
  const documentName = vendor ? "business permit" : "driver's license";

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.documentRenewal.updateMany({
        where: { id, status: "PENDING" },
        data: { status: decision, note: approved ? null : note, reviewedAt: new Date(), file: null },
      });
      if (count === 0) throw new HttpError(409, "This renewal was already reviewed. Refresh to see the latest.");
      if (approved && vendor) {
        await tx.vendor.update({ where: { id: vendor.id }, data: { permitNumber: renewal!.number, permitExpiresAt: renewal!.expiresAt, permitFile: renewal!.file } });
      }
      if (approved && rider) {
        await tx.riderProfile.update({ where: { id: rider.id }, data: { licenseNumber: renewal!.number, licenseExpiresAt: renewal!.expiresAt, licenseFile: renewal!.file } });
      }
      await logActivity(tx, by.actor, {
        category: "DOCUMENTS",
        action: approved ? `Approved renewed ${documentName}` : `Rejected renewed ${documentName}`,
        target: vendor?.name ?? rider!.user.name,
        detail: approved ? null : note,
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "This license number is already registered to another rider.");
    }
    throw error;
  }

  // Only once the database agrees: the file that's no longer in use
  await removeDocument(approved ? (vendor?.permitFile ?? rider?.licenseFile) : renewal!.file);
  const suspended = (vendor?.status ?? rider?.status) === "SUSPENDED";
  await notify(vendor?.ownerId ?? rider!.userId, {
    title: approved ? `Your renewed ${documentName} was approved` : `Your renewed ${documentName} wasn't approved`,
    body: approved ? (suspended ? "Your account is still suspended until it's reinstated." : "Thanks for keeping it up to date.") : `Reason: ${note}`,
    link: vendor ? "/vendor/store#permit" : "/rider/license",
  });
}
