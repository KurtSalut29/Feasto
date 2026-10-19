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
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const email = z
  .email("Enter a valid email address.")
  .trim()
  .transform((value) => value.toLowerCase());

// Philippine mobile numbers: 09XXXXXXXXX or +639XXXXXXXXX
const phone = z
  .string()
  .trim()
  .regex(/^(\+639|09)\d{9}$/, "Enter a mobile number like 09171234567.");

const accountFields = {
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  email,
  phone,
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(72)
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/\d/, "Include at least one number."),
};

// Admin accounts are never self-registered; they come from the seed step.
const registerSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("RESIDENT"), ...accountFields }),
  z.object({ role: z.literal("RIDER"), ...accountFields }),
  z.object({
    role: z.literal("VENDOR"),
    ...accountFields,
    storeName: z.string().trim().min(2, "Enter your store's name.").max(80),
    storeAddress: z.string().trim().min(5, "Enter your store's address.").max(200),
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
  vendor: { select: { id: true, name: true, status: true } },
} satisfies Prisma.UserSelect;

authRouter.post("/register", async (req, res) => {
  const input = parseBody(registerSchema, req.body);

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
          vendor: { create: { name: input.storeName, address: input.storeAddress, opensAt: "08:00", closesAt: "21:00" } },
        }),
      },
      select: publicUser,
    });

    res.cookie(SESSION_COOKIE, await signSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions);
    res.status(201).json({ user });
  } catch (error) {
    // The unique index on email also stops two simultaneous sign-ups with the same
    // email that reach different API copies.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
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
