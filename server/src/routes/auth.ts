import { Router, type Request, type Response } from "express";
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
import { checkSignupCode, emailVerified, forgetVerified, mailReady, sendSignupCode } from "../lib/emailCodes.js";
import { emailProblem, fullName, ID_TYPES, nameFields, newPassword, passwordHasOwnDetails } from "../lib/identity.js";
import { atLimit, clearFailedLogins, clientIp, hit, loginLockSeconds, recordFailedLogin, tooMany } from "../lib/rateLimit.js";
import { getSettings } from "../lib/settings.js";
import { acceptsReservationsByDefault, STORE_TYPES } from "../lib/storeTypes.js";
import { mobileNumber, newRiderCode, notifyStoreOfRider, permitFields, riderFields, storeForCode } from "../lib/verification.js";
import { requireAuth } from "../middleware/auth.js";
import { requireHuman } from "../lib/turnstile.js";
import { alreadyRead, checkingOn } from "../lib/documentCheck.js";
import { answerPrecheck, chosenIdType, headerText, precheckBody, precheckOff } from "./documents.js";
import { checkOwnCode, checkSecondStep, clearTries, confirmSetup, countPasskeyTry, deviceLabel, deviceOf, emailSecondStep, finishLogin, mustUseApp, needsThird, nextStep, passkeyCount, pendingUser, readThird, renewBackupCodes, secondStep, setupUserOf, startSetup, warnLockedOut } from "../lib/twoStep.js";
import { authenticationOptions, checkAuthentication, registrationOptions, saveRegistration } from "../lib/passkeys.js";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

export const authRouter = Router();

const email = z
  .email("Enter a valid email address.")
  .trim()
  .transform((value) => value.toLowerCase());

/** The rules for a new password (sign-up and changing it) live with the other identity checks */
export { newPassword };

/** The version of the Terms of Service and Privacy Policy on the web's /terms and /privacy pages.
 * Change it with the text; each account records the version it agreed to. */
export const TERMS_VERSION = "2026-11-19";

const accountFields = {
  ...nameFields,
  email,
  phone: mobileNumber,
  password: newPassword,
  acceptTerms: z.literal(true, "Agree to Feasto's Terms of Service and Privacy Policy to create an account."),
};

// Admin accounts are never self-registered; they come from the seed step.
const registerSchema = z.discriminatedUnion("role", [
  // A resident also says which valid ID they're uploading (the photo goes up right after the account is made)
  z.object({ role: z.literal("RESIDENT"), ...accountFields, idType: z.enum(ID_TYPES, "Choose the kind of ID you're uploading.") }),
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
  firstName: true,
  middleName: true,
  lastName: true,
  suffix: true,
  idType: true,
  idStatus: true,
  idReviewNote: true,
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
      permitPausedAt: true,
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

/** Accounts all of Feasto takes in 10 minutes: far above a whole class signing up at once, and the
 * only cap on the classroom laptop, where every phone arrives from the same address. */
const SIGNUPS_OVERALL = 300;
const SIGNUP_WINDOW = 10 * 60;

/**
 * Checks an email while the person is still typing the form: a typo in a big mail domain (with the
 * fix), a throwaway inbox, a domain no email can reach, or an email that already has an account.
 */
authRouter.post("/check-email", async (req, res) => {
  const ip = clientIp(req);
  if (ip) {
    const { over, retryAfter } = await hit(`rate:check-email:${ip}`, 60, 600);
    if (over) tooMany(res, retryAfter, "Too many email checks from this network.");
  }
  const parsed = email.safeParse(req.body?.email);
  if (!parsed.success) return void res.json({ ok: false, error: "Enter a valid email address, like juan@gmail.com." });
  if (await prisma.user.findUnique({ where: { email: parsed.data }, select: { id: true } })) {
    return void res.json({ ok: false, error: "An account with this email already exists. Log in instead.", taken: true });
  }
  const problem = await emailProblem(parsed.data);
  if (problem) return void res.json({ ok: false, error: problem.message, suggestion: problem.suggestion });
  res.json({ ok: true });
});

/** Emails a 6-digit code, after the same checks as check-email (so no code goes to a bad address) */
authRouter.post("/email-code", async (req, res) => {
  const ip = clientIp(req);
  if (ip) {
    const { over, retryAfter } = await hit(`rate:email-code:${ip}`, 20, 3600);
    if (over) tooMany(res, retryAfter, "Too many codes from this network.");
  }
  const address = parseBody(z.object({ email }), req.body).email;
  if (await prisma.user.findUnique({ where: { email: address }, select: { id: true } })) {
    throw new ValidationError({ email: ["An account with this email already exists. Log in instead."] });
  }
  const problem = await emailProblem(address);
  if (problem) throw new ValidationError({ email: [problem.message] });
  res.json(await sendSignupCode(address));
});

/** The code they typed: right marks the email verified for the rest of the sign-up */
authRouter.post("/email-code/verify", async (req, res) => {
  const ip = clientIp(req);
  if (ip) {
    const { over, retryAfter } = await hit(`rate:email-verify:${ip}`, 60, 600);
    if (over) tooMany(res, retryAfter, "Too many tries from this network.");
  }
  const input = parseBody(z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Type the 6 digits from the email.") }), req.body);
  await checkSignupCode(input.email, input.code);
  res.json({ ok: true });
});

/** Whether sign-up codes can be emailed now (the form says so up front when they can't) */
authRouter.get("/email-code", (_req, res) => {
  res.json({ ready: mailReady() });
});

/**
 * The photo of the ID, license or permit checked while the person is still on the sign-up form, so
 * a selfie, a sample picture or a driver's license sent as "PhilSys ID" is caught before the account
 * exists. Only after the email is confirmed (so it can't be used as a free document reader), and a
 * few times an hour. Nothing is saved but the reading, which the upload after sign-up reuses.
 */
authRouter.post("/document-check", precheckBody, async (req, res) => {
  if (!checkingOn()) return void res.json(precheckOff);
  const address = headerText(req, "x-email").toLowerCase();
  if (!address || !(await emailVerified(address))) throw new HttpError(403, "Confirm your email first: type the code we sent to it.");
  const ip = clientIp(req);
  const limits: [string, number][] = [[`rate:doc-check:email:${address}`, 12], ...(ip ? ([[`rate:doc-check:ip:${ip}`, 40]] as [string, number][]) : [])];
  for (const [key, limit] of Buffer.isBuffer(req.body) && (await alreadyRead(req.body)) ? [] : limits) {
    const { over, retryAfter } = await hit(key, limit, 3600);
    if (over) tooMany(res, retryAfter, "You've checked a lot of photos just now.");
  }
  const kind = String(req.get("x-document-kind") ?? "");
  if (kind !== "RESIDENT_ID" && kind !== "LICENSE" && kind !== "PERMIT") throw new HttpError(400, "Say which document this is.");
  await answerPrecheck(req, res, kind, kind === "RESIDENT_ID" ? chosenIdType(req) : null, headerText(req, "x-expected-name"));
});

authRouter.post("/register", async (req, res) => {
  const input = parseBody(registerSchema, req.body);
  await requireHuman(req);
  // Beyond the format: a domain that can't receive mail, a throwaway inbox, or a typo
  const problem = await emailProblem(input.email);
  if (problem) throw new ValidationError({ email: [problem.message] });
  // The code Feasto emailed must have been typed first: the email is really theirs
  if (!(await emailVerified(input.email))) throw new ValidationError({ emailCode: ["Confirm your email first: type the code we sent to it."] });
  if (passwordHasOwnDetails(input.password, [input.firstName, input.lastName, input.email.split("@")[0]])) {
    throw new ValidationError({ password: ["Don't use your name or email in your password."] });
  }
  // Only accounts actually made are counted (a typo in the form costs nothing), so check first
  const ip = clientIp(req);
  const networkKey = ip ? `rate:signup:ip:${ip}` : null;
  const { signupsPerNetwork } = await getSettings();
  const wait = Math.max(networkKey ? await atLimit(networkKey, signupsPerNetwork) : 0, await atLimit("rate:signup:all", SIGNUPS_OVERALL));
  if (wait) tooMany(res, wait, "A lot of accounts were just made from this network.");
  // A rider joining a store needs its code to be right before anything is saved
  const riderStore = input.role === "RIDER" && input.storeCode ? await storeForCode(input.storeCode) : null;

  try {
    const user = await prisma.user.create({
      data: {
        name: fullName(input),
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        suffix: input.suffix,
        ...(input.role === "RESIDENT" && { idType: input.idType }),
        email: input.email,
        phone: input.phone,
        role: input.role,
        passwordHash: await hashPassword(input.password),
        termsAcceptedAt: new Date(),
        termsVersion: TERMS_VERSION,
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

    await forgetVerified(input.email);
    if (riderStore) await notifyStoreOfRider(riderStore.ownerId, user.name);
    await Promise.all([hit("rate:signup:all", SIGNUPS_OVERALL, SIGNUP_WINDOW), networkKey && hit(networkKey, signupsPerNetwork, SIGNUP_WINDOW)]);

    // Signs them in and remembers this browser as theirs, so it never counts as a new sign-in
    await finishLogin(req, res, { id: user.id, email: input.email, name: user.name, role: user.role, totpEnabledAt: null });
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
  await requireHuman(req);

  const lockSeconds = await loginLockSeconds(email);
  if (lockSeconds > 0) {
    throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(lockSeconds / 60)} minute(s).`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Hash even when the email is unknown so both cases take the same time to answer
  const valid = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
  if (!user || !valid) {
    if (await recordFailedLogin(email)) await warnLockedOut(email);
    // Same message for both cases so nobody can probe which emails have accounts
    throw new HttpError(401, "Incorrect email or password.");
  }

  await clearFailedLogins(email);
  // Only someone with the right password learns the account is disabled
  if (user.disabledAt) throw new HttpError(403, "This account has been disabled. Please contact Feasto support.");
  // The second step, when the account uses an authenticator app (or must set one up)
  const step = await nextStep(user, deviceOf(req, res));
  if (step !== "done") return void res.json(await secondStep(user, step));
  await finishLogin(req, res, user);

  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser });
  res.json({ user: profile });
});

// ---------- Two-step login ----------

const secondStepSchema = z.object({
  token: z.string().min(10),
  method: z.enum(["app", "backup", "email"]).default("app"),
  code: z.string("Type the code.").trim().min(6, "Type the code.").max(20),
  /** Skip the code on this browser for 30 days */
  remember: z.boolean().optional().default(false),
});

const loginUserOf = (id: string) => prisma.user.findUniqueOrThrow({ where: { id }, select: { id: true, email: true, name: true, role: true, totpEnabledAt: true, disabledAt: true } });

/** Logged in: the cookie, and the account for the page */
async function loggedIn(req: Request, res: Response, user: Awaited<ReturnType<typeof loginUserOf>>, remember: boolean, extra: Record<string, unknown> = {}) {
  if (user.disabledAt) throw new HttpError(403, "This account has been disabled. Please contact Feasto support.");
  await finishLogin(req, res, user, { remember });
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser });
  res.json({ user: profile, ...extra });
}

authRouter.post("/two-step", async (req, res) => {
  const input = parseBody(secondStepSchema, req.body);
  const { user, backupLeft } = await checkSecondStep(input.token, input.method, input.code);
  // The admin's third step: a passkey after the code
  if ((await needsThird(user.role)) && (await passkeyCount(user.id)) > 0) return void res.json(await secondStep(user, "third", "code", input.remember));
  await loggedIn(req, res, await loginUserOf(user.id), input.remember, { backupLeft });
});

/** The admin's third step when the second was a passkey: a code */
authRouter.post("/two-step/third", async (req, res) => {
  const input = parseBody(secondStepSchema, req.body);
  const pending = await readThird(input.token);
  // After a code, the passkey; an emailed code stands in for a lost passkey (another inbox to get into)
  if (pending.done !== "passkey" && input.method !== "email") throw new HttpError(400, "Use your passkey for this step, or ask for a code by email if you lost it.");
  const { user, backupLeft } = await checkSecondStep(input.token, input.method, input.code, "third");
  await loggedIn(req, res, await loginUserOf(user.id), pending.remember, { backupLeft });
});

/** The browser's passkey prompt during login: to sign in with one, or (setting up) to make one */
authRouter.post("/two-step/passkey/options", async (req, res) => {
  const { token } = parseBody(z.object({ token: z.string().min(10) }), req.body);
  const pending = await pendingUser(token);
  res.json({ options: pending.purpose === "setup" ? await registrationOptions(req, pending.userId) : await authenticationOptions(req, pending.userId), mode: pending.purpose === "setup" ? "create" : "get" });
});

const passkeyStepSchema = z.object({
  token: z.string().min(10),
  response: z.looseObject({ id: z.string(), type: z.string(), response: z.looseObject({}) }),
  remember: z.boolean().optional().default(false),
});

authRouter.post("/two-step/passkey", async (req, res) => {
  const input = parseBody(passkeyStepSchema, req.body);
  const pending = await pendingUser(input.token);
  const user = await loginUserOf(pending.userId);
  if (pending.purpose === "setup") {
    // A required second step, set up as a passkey: no app or backup codes needed (a lost phone uses an emailed code)
    await saveRegistration(req, user.id, input.response as unknown as RegistrationResponseJSON, deviceLabel(req.get("user-agent")));
    return void (await loggedIn(req, res, user, false, { passkeyAdded: true }));
  }
  if (pending.purpose === "third" && pending.done === "passkey") throw new HttpError(400, "Type a code for this step.");
  await countPasskeyTry(user.id);
  if (!(await checkAuthentication(req, user.id, input.response as unknown as AuthenticationResponseJSON))) {
    throw new HttpError(401, "That passkey didn't work. Try again, or use a code.");
  }
  await clearTries(user.id);
  const remember = pending.purpose === "third" ? pending.remember : input.remember;
  // The admin's third step after a passkey: a code
  if (pending.purpose === "verify" && (await needsThird(user.role))) return void res.json(await secondStep(user, "third", "passkey", remember));
  await loggedIn(req, res, user, remember);
});

// ---------- Passkeys for someone logged in ----------

authRouter.post("/passkeys/options", requireAuth, async (req, res) => {
  res.json({ options: await registrationOptions(req, req.session!.userId) });
});

authRouter.post("/passkeys", requireAuth, async (req, res) => {
  const { response } = parseBody(z.object({ response: passkeyStepSchema.shape.response }), req.body);
  const passkey = await saveRegistration(req, req.session!.userId, response as unknown as RegistrationResponseJSON, deviceLabel(req.get("user-agent")));
  res.status(201).json({ passkey });
});

authRouter.delete("/passkeys/:id", requireAuth, async (req, res) => {
  const userId = req.session!.userId;
  const passkey = await prisma.passkey.findFirst({ where: { id: String(req.params.id), userId } });
  if (!passkey) throw new HttpError(404, "That passkey isn't on your account.");
  const [count, me] = await Promise.all([passkeyCount(userId), prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true, role: true } })]);
  if (count === 1) {
    if (await needsThird(me.role)) throw new HttpError(403, "Three-step login needs a passkey. Add another passkey first, or turn three-step login off in Settings.");
    if (!me.totpEnabledAt && (await mustUseApp(me.role))) throw new HttpError(403, "Your account must keep a second step. Add another passkey or the authenticator app first.");
  }
  await prisma.passkey.delete({ where: { id: passkey.id } });
  res.json({ ok: true });
});

authRouter.post("/two-step/email", async (req, res) => {
  const { token } = parseBody(z.object({ token: z.string().min(10) }), req.body);
  if ((await hit(`rate:two-step-email:${clientIp(req) ?? "all"}`, 10, 3600)).over) throw new HttpError(429, "Too many codes. Try again in an hour.");
  res.json(await emailSecondStep(token));
});

/** A required setup during login: the QR code, before there's a session */
authRouter.post("/two-step/setup", async (req, res) => {
  const { token } = parseBody(z.object({ token: z.string().min(10) }), req.body);
  res.json(await startSetup(await setupUserOf(token)));
});

authRouter.post("/two-step/setup/confirm", async (req, res) => {
  const { token, code } = parseBody(z.object({ token: z.string().min(10), code: z.string("Type the code.").trim().min(6, "Type the 6 digits.").max(8) }), req.body);
  const userId = await setupUserOf(token);
  const backupCodes = await confirmSetup(userId, code);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, totpEnabledAt: true } });
  await finishLogin(req, res, user);
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUser });
  res.json({ user: profile, backupCodes });
});

/** For someone logged in: whether it's on, required, and how many backup codes are left */
authRouter.get("/two-step/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.session!.userId },
    select: { totpEnabledAt: true, backupCodes: true, role: true, passkeys: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, createdAt: true, lastUsedAt: true, backedUp: true, rpId: true } } },
  });
  const devices = await prisma.knownDevice.findMany({ where: { userId: req.session!.userId }, orderBy: { lastSeenAt: "desc" }, take: 10, select: { id: true, label: true, lastSeenAt: true, trustedUntil: true, createdAt: true } });
  res.json({
    enabled: Boolean(user.totpEnabledAt),
    since: user.totpEnabledAt,
    required: await mustUseApp(user.role),
    threeStep: await needsThird(user.role),
    backupLeft: user.backupCodes.length,
    devices,
    passkeys: user.passkeys,
    mailReady: mailReady(),
  });
});

authRouter.post("/two-step/start", requireAuth, async (req, res) => {
  res.json(await startSetup(req.session!.userId));
});

authRouter.post("/two-step/confirm", requireAuth, async (req, res) => {
  const { code } = parseBody(z.object({ code: z.string("Type the code.").trim().min(6, "Type the 6 digits.").max(8) }), req.body);
  res.json({ backupCodes: await confirmSetup(req.session!.userId, code) });
});

authRouter.post("/two-step/backup-codes", requireAuth, async (req, res) => {
  const { code } = parseBody(z.object({ code: z.string("Type the code.").trim().min(6).max(8) }), req.body);
  await checkOwnCode(req.session!.userId, code);
  res.json({ backupCodes: await renewBackupCodes(req.session!.userId) });
});

authRouter.post("/two-step/off", requireAuth, async (req, res) => {
  const { code } = parseBody(z.object({ code: z.string("Type the code.").trim().min(6).max(8) }), req.body);
  if ((await mustUseApp(req.session!.role)) && (await passkeyCount(req.session!.userId)) === 0) {
    throw new HttpError(403, "Your account must keep a second step. Add a passkey first, then you can turn the app off.");
  }
  await checkOwnCode(req.session!.userId, code);
  await prisma.user.update({ where: { id: req.session!.userId }, data: { totpSecret: null, totpEnabledAt: null, backupCodes: [] } });
  await prisma.knownDevice.updateMany({ where: { userId: req.session!.userId }, data: { trustedUntil: null } });
  res.json({ ok: true });
});

/** Forget every remembered browser: the code is asked again everywhere */
authRouter.post("/two-step/forget-devices", requireAuth, async (req, res) => {
  await prisma.knownDevice.updateMany({ where: { userId: req.session!.userId }, data: { trustedUntil: null } });
  res.json({ ok: true });
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
