import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import {
  hashPassword,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifyPassword,
} from "../lib/auth.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { clearFailedLogins, loginLockSeconds, recordFailedLogin } from "../lib/rateLimit.js";
import { acceptsReservationsByDefault, STORE_TYPES } from "../lib/storeTypes.js";
import { mobileNumber, newRiderCode, notifyStoreOfRider, permitFields, riderFields, storeForCode } from "../lib/verification.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const email = z
  .email("Enter a valid email address.")
  .trim()
  .transform((value) => value.toLowerCase());

/** The rules for a password at sign-up, also used when changing it. */
export const newPassword = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72)
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

const accountFields = {
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email,
  phone: mobileNumber,
  password: newPassword,
};

// Admin accounts are never self-registered; they come from the seed step.
const registerSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("RESIDENT"), ...accountFields }),
  z.object({ role: z.literal("RIDER"), ...accountFields, ...riderFields }),
  z.object({
    role: z.literal("VENDOR"),
    ...accountFields,
    storeName: z.string().trim().min(2, "Enter your store's name.").max(80),
    storeAddress: z.string().trim().min(5, "Enter your store's address.").max(200),
    storeType: z.enum(STORE_TYPES, "Choose your store type."),
    // Optional: when left out, it follows the store type (on for dine-in places)
    acceptsReservations: z.boolean().optional(),
    // Where the store is, so riders can be matched by how near they are
    latitude: z.number("Set your store's pin on the map.").min(-90).max(90),
    longitude: z.number("Set your store's pin on the map.").min(-180).max(180),
    ...permitFields,
  }),
  ]);

const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

/** The user fields that are safe to send to the browser. */
const publicUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  vendor: {
    select: {
      id: true,
      name: true,
      storeType: true,
      acceptsReservations: true,
      address: true,
      description: true,
      opensAt: true,
      closesAt: true,
      imageUrl: true,
      isTemporarilyClosed: true,
      status: true,
      reviewNote: true,
      permitExpiresAt: true,
    },
  },
  riderProfile: {
    select: { vehicleModel: true, plateNumber: true, licenseExpiresAt: true, status: true, reviewNote: true, isOnline: true, vendor: { select: { name: true } } },
  },
} satisfies Prisma.UserSelect;

/**
 * Which unique index a P2002 error was about, e.g. "RiderProfile_licenseNumber_key".
 * With Prisma's Postgres driver adapter the details sit under meta.driverAdapterError.
 */
function uniqueViolationField(error: Prisma.PrismaClientKnownRequestError): string {
  const meta = error.meta as
    | {
        target?: string[] | string;
        driverAdapterError?: { cause?: { constraint?: { index?: string; fields?: string[] } } };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  const found = constraint?.index ?? constraint?.fields ?? meta?.target ?? [];
  return Array.isArray(found) ? found.join(",") : found;
}

authRouter.post("/register", async (req, res) => {
  const input = parseBody(registerSchema, req.body);
  // A rider joining a store needs its code to be right before anything is saved
  const riderStore = input.role === "RIDER" && input.storeCode ? await storeForCode(input.storeCode) : null;

  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        passwordHash: await hashPassword(input.password),
        // A vendor account and its store are created together in one transaction.
        // New stores start as PENDING until an admin approves them.
        ...(input.role === "VENDOR" && {
          vendor: {
            create: {
              name: input.storeName,
              address: input.storeAddress,
              storeType: input.storeType,
              acceptsReservations: input.acceptsReservations ?? acceptsReservationsByDefault(input.storeType),
              latitude: input.latitude,
              longitude: input.longitude,
              businessName: input.businessName,
              businessPhone: input.businessPhone,
              permitNumber: input.permitNumber,
              permitExpiresAt: input.permitExpiresAt,
              riderCode: newRiderCode(),
              opensAt: "08:00",
              closesAt: "21:00",
            },
          },
        }),
        // Riders also start as PENDING: their store approves them if they gave its code,
        // otherwise the admin does. The license photo is uploaded right after this.
        ...(input.role === "RIDER" && {
          riderProfile: {
            create: {
              vendorId: riderStore?.id,
              birthDate: input.birthDate,
              address: input.address,
              emergencyName: input.emergencyName,
              emergencyPhone: input.emergencyPhone,
              vehicleModel: input.vehicleModel,
              plateNumber: input.plateNumber,
              licenseNumber: input.licenseNumber,
              licenseExpiresAt: input.licenseExpiresAt,
            },
          },
        }),
      },
      select: publicUser,
    });

    if (riderStore) await notifyStoreOfRider(riderStore.ownerId, user.name);

    res.cookie(SESSION_COOKIE, await signSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions);
    res.status(201).json({ user });
  } catch (error) {
    // The unique index on email also stops two simultaneous sign-ups with the same
    // email that reach different API copies.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      if (uniqueViolationField(error).includes("licenseNumber")) {
        throw new ValidationError({ licenseNumber: ["This license number is already registered to another rider."] });
      }
      if (uniqueViolationField(error).includes("riderCode")) throw new HttpError(409, "Two sign-ups happened at the same moment. Tap Create account again.");
      throw new ValidationError({ email: ["An account with this email already exists."] });
    }
    throw error;
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body);

  const lockSeconds = await loginLockSeconds(email);
  if (lockSeconds > 0) {
    throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(lockSeconds / 60)} minute(s).`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Hash even when the email is unknown so both cases take the same time to answer
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
  if (!user || !valid) {
    await recordFailedLogin(email);
    // Same message for both cases so nobody can probe which emails have accounts
    throw new HttpError(401, "Incorrect email or password.");
  }

  await clearFailedLogins(email);
  // Only someone with the right password learns the account is disabled
  if (user.disabledAt) throw new HttpError(403, "This account has been disabled. Please contact Feasto support.");
  res.cookie(SESSION_COOKIE, await signSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions);

  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser });
  res.json({ user: profile });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session!.userId }, select: publicUser });
  if (!user) throw new HttpError(401, "Please log in to continue.");
  res.json({ user });
});
