import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ApprovalStatus } from "../generated/prisma/client.js";
import { logActivity, type Actor } from "./activity.js";
import { prisma } from "./db.js";
import { HttpError, ValidationError } from "./http.js";
import { notify } from "./liveUpdates.js";

/** Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX */
export const mobileNumber = z
  .string("Enter a mobile number like 09171234567.")
  .trim()
  .regex(/^(\+639|09)\d{9}$/, "Enter a mobile number like 09171234567.");

const text = (min: number, max: number, message: string) => z.string(message).trim().min(min, message).max(max, message);

const manilaToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** A calendar date as YYYY-MM-DD, kept as midnight UTC to suit a DATE column. */
const calendarDate = (message: string) =>
  z
    .string(message)
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .refine((value) => !Number.isNaN(Date.parse(value)), message);

const notExpired = (message: string) =>
  calendarDate(message)
    .refine((value) => value > manilaToday(), "This has already expired. Upload a valid one.")
    .transform((value) => new Date(value));

/** Riders must be adults: the date 18 years ago compared as text, which sorts like a date. */
const adultBirthDate = calendarDate("Enter your birth date.")
  .refine((value) => value >= "1926-01-01", "Enter your birth date.")
  .refine((value) => {
    const today = manilaToday();
    return value <= `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
  }, "Riders must be at least 18 years old.")
  .transform((value) => new Date(value));

const upperCase = (pattern: RegExp, message: string) =>
  z
    .string(message)
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(pattern, message));

/** What a store gives to be verified. The store's name, address and type are separate. */
export const permitFields = {
  businessName: text(2, 120, "Enter the business name on the permit."),
  businessPhone: mobileNumber,
  permitNumber: upperCase(/^[A-Z0-9][A-Z0-9 /-]{3,29}$/, "Enter the permit number shown on the document."),
  permitExpiresAt: notExpired("Enter the permit's expiry date."),
};

/** Blank means a free rider. Spaces, dashes and small letters in the code don't matter. */
const storeCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^[A-Z0-9]{8}$/, "Enter the 8-character code from your store.")]))
  .transform((value) => (value ? `${value.slice(0, 4)}-${value.slice(4)}` : undefined))
  .optional();

/** What a rider gives to be verified. Feasto riders all use motorcycles. */
export const riderFields = {
  birthDate: adultBirthDate,
  address: text(5, 200, "Enter your home address."),
  emergencyName: text(2, 80, "Enter who to call in an emergency."),
  emergencyPhone: mobileNumber,
  vehicleModel: text(2, 60, "Enter your motorcycle's make and model."),
  plateNumber: upperCase(/^[A-Z0-9][A-Z0-9 -]{3,9}$/, "Enter a plate number like ABC 1234."),
  licenseNumber: upperCase(/^[A-Z0-9][A-Z0-9-]{5,19}$/, "Enter a license number like N01-23-456789."),
  licenseExpiresAt: notExpired("Enter your license's expiry date."),
  storeCode,
};

// No 0/O or 1/I, so a code read out loud or from a photo can't be mistaken
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A store's code for its riders, like NENA-4821 but random. */
export function newRiderCode() {
  const letters = [...randomBytes(8)].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join("");
  return `${letters.slice(0, 4)}-${letters.slice(4)}`;
}

/** The approved store a rider's code belongs to. */
export async function storeForCode(code: string) {
  const store = await prisma.vendor.findFirst({ where: { riderCode: code, status: "APPROVED" }, select: { id: true, ownerId: true, name: true } });
  if (!store) throw new ValidationError({ storeCode: ["No approved store has this code. Check it with your store."] });
  return store;
}

/** Tells a store that someone is waiting for its approval. */
export const notifyStoreOfRider = (ownerId: string, riderName: string) =>
  notify(ownerId, { title: `${riderName} wants to ride for your store`, body: "Check their license and approve or reject them.", link: "/vendor/riders" });

/** "pdf", "image", or null before anything is uploaded. Pages use it to show the right preview. */
export const documentKind = (file: string | null) => (file ? (file.endsWith(".pdf") ? "pdf" : "image") : null);

// ---------- Reviewing applications ----------

/** Which statuses each decision may come from. */
export const ALLOWED_FROM: Record<Exclude<ApprovalStatus, "PENDING">, ApprovalStatus[]> = {
  APPROVED: ["PENDING", "REJECTED", "SUSPENDED"], // approve, reconsider, or reinstate
  REJECTED: ["PENDING"],
  SUSPENDED: ["APPROVED"],
};

export const reviewSchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.decision === "APPROVED" || (v.note && v.note.length >= 3), {
    path: ["note"],
    message: "Give a short reason so they know what to fix.",
  });

export const decisionWords = { APPROVED: "approved", REJECTED: "not approved", SUSPENDED: "suspended" } as const;

/** How the activity log words each decision. */
export const decisionVerbs = { APPROVED: "Approved", REJECTED: "Rejected", SUSPENDED: "Suspended" } as const;

/**
 * Reviews a rider. A store decides about its own riders and the admin about free riders.
 * The admin can also suspend a store's rider, and then only the admin can lift that.
 */
export async function reviewRider(
  id: string,
  { decision, note }: z.infer<typeof reviewSchema>,
  by: ({ admin: true } | { vendorId: string }) & { actor: Actor },
) {
  const rider = await prisma.riderProfile.findUnique({
    where: { id },
    select: { userId: true, vendorId: true, licenseFile: true, suspendedByAdmin: true, user: { select: { name: true } }, vendor: { select: { name: true } } },
  });
  if ("vendorId" in by) {
    if (!rider || rider.vendorId !== by.vendorId) throw new HttpError(404, "This rider isn't part of your store.");
    if (rider.suspendedByAdmin) throw new HttpError(403, "The Feasto admin suspended this rider, so only the admin can lift it.");
  } else {
    if (!rider) throw new HttpError(404, "We couldn't find this rider.");
    if (rider.vendorId && decision !== "SUSPENDED" && !rider.suspendedByAdmin) {
      throw new HttpError(403, `${rider.vendor?.name ?? "The rider's store"} reviews this rider.`);
    }
  }
  if (decision === "APPROVED" && !rider.licenseFile) throw new HttpError(409, "This rider hasn't uploaded a driver's license yet.");

  // Only change it if it's still in a state this decision may come from. If the store and the
  // admin review the same rider at once, the second update matches nothing and is refused.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.riderProfile.updateMany({
      where: { id, status: { in: ALLOWED_FROM[decision] } },
      data: {
        status: decision,
        reviewNote: decision === "APPROVED" ? null : note,
        reviewedAt: new Date(),
        suspendedByAdmin: "admin" in by && decision === "SUSPENDED",
        // A suspended rider is taken offline immediately
        ...(decision !== "APPROVED" && { isOnline: false }),
      },
    });
    if (count === 0) throw new HttpError(409, "This rider was already reviewed or changed. Refresh to see their current status.");
    await logActivity(tx, by.actor, {
      category: "APPROVALS",
      action: `${decisionVerbs[decision]} rider`,
      target: rider.user.name,
      detail: decision === "APPROVED" ? null : note,
    });
  });

  await notify(rider.userId, {
    title: `Your rider account was ${decisionWords[decision]}`,
    body: decision === "APPROVED" ? "You can now go online and accept delivery jobs." : `Reason: ${note}`,
    link: "/rider",
  });
}
