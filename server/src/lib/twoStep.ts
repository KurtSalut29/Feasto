import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { config } from "../config.js";
import type { Role } from "../generated/prisma/enums.js";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "./auth.js";
import { prisma } from "./db.js";
import { emailHtml, mailReady, sendEmail } from "./emailCodes.js";
import { HttpError, ValidationError } from "./http.js";
import { notify } from "./liveUpdates.js";
import { redis } from "./redis.js";
import { getSettings } from "./settings.js";
import { newBackupCodes, newSecret, openSecret, otpauthUrl, base32, sealSecret, useBackupCode, useCode } from "./totp.js";

/**
 * Logging in, with the second step when it's on:
 *
 *   1. Email and password, as before.
 *   2. If the account uses an authenticator app, a 6-digit code from it (or a backup code, or a code
 *      sent by email if the phone is lost), unless this browser was remembered for 30 days.
 *      Admins and store owners must set the app up first, while the admin's "require2fa" is on.
 *   3. The session cookie. A browser the account never used before gets a "new sign-in" alert.
 *
 * Between 1 and 2 the browser only holds a short-lived token that proves the password was right.
 */

export const DEVICE_COOKIE = "feasto_device";
const DEVICE_DAYS = 400;
const REMEMBER_DAYS = 30;
const PENDING_MINUTES = 10;
const MAX_TRIES = 6;
const CODE_MINUTES = 10;

type Pending = { userId: string; purpose: "verify" | "setup" };
const purposeKey = new TextEncoder().encode(`${config.jwtSecret}:two-step`);

export async function pendingToken(p: Pending) {
  return new SignJWT({ purpose: p.purpose }).setProtectedHeader({ alg: "HS256" }).setSubject(p.userId).setIssuedAt().setExpirationTime(`${PENDING_MINUTES}m`).sign(purposeKey);
}

async function readPending(token: string, purpose: Pending["purpose"]) {
  try {
    const { payload } = await jwtVerify(token, purposeKey, { algorithms: ["HS256"] });
    if (payload.purpose !== purpose || !payload.sub) throw new Error("wrong purpose");
    return payload.sub;
  } catch {
    throw new HttpError(401, "This login took too long. Enter your email and password again.");
  }
}

// ---------- The browser ----------

const hashDevice = (id: string) => createHash("sha256").update(Buffer.from(config.jwtSecret)).update(`:device:${id}`).digest("hex");

/** This browser's random id, from its long-lived cookie (made now if it has none) */
export function deviceOf(req: Request, res: Response): string {
  // Worked out once per request, so a new browser gets one id even when asked twice
  if (typeof res.locals.device === "string") return res.locals.device;
  let id = req.cookies?.[DEVICE_COOKIE] as string | undefined;
  if (!id || !/^[A-Za-z0-9_-]{20,64}$/.test(id)) {
    id = randomBytes(24).toString("base64url");
    res.cookie(DEVICE_COOKIE, id, { ...sessionCookieOptions, maxAge: DEVICE_DAYS * 86400_000 });
  }
  res.locals.device = hashDevice(id);
  return res.locals.device as string;
}

/** "Chrome on Android", from the browser's own description */
export function deviceLabel(userAgent = "") {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /SamsungBrowser/.test(userAgent)
      ? "Samsung Internet"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "A browser";
  const os = /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iPhone" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux" : "a computer";
  return `${browser} on ${os}`;
}

// ---------- Is the second step needed? ----------

type LoginUser = { id: string; email: string; name: string; role: Role; totpEnabledAt: Date | null };

export const mustUseApp = async (role: Role) => (role === "ADMIN" || role === "VENDOR") && (await getSettings()).require2fa;

/** What comes after the password: nothing, the code, or setting up the app first */
export async function nextStep(user: LoginUser, device: string): Promise<"done" | "verify" | "setup"> {
  if (user.totpEnabledAt) {
    const known = await prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash: device } }, select: { trustedUntil: true } });
    return known?.trustedUntil && known.trustedUntil > new Date() ? "done" : "verify";
  }
  return (await mustUseApp(user.role)) ? "setup" : "done";
}

const maskEmail = (email: string) => email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${"•".repeat(Math.min(mid.length, 6))}${b}`);

/** What the login page needs for the second step */
export async function secondStep(user: LoginUser, step: "verify" | "setup") {
  const token = await pendingToken({ userId: user.id, purpose: step });
  return step === "verify" ? { twoStep: { token, email: maskEmail(user.email), canEmail: mailReady() } } : { twoStepSetup: { token, email: user.email } };
}

// ---------- Finishing the login ----------

/**
 * The seeded demo accounts use made-up addresses (admin@feasto.com, …@sample.feasto.com) that nobody
 * here reads, so alerts for them stay in the app and never go out as email.
 */
export const placeholderEmail = (email: string) => /@(sample\.)?feasto\.com$/i.test(email);

const when = (d: Date) => d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/**
 * Sets the session cookie and remembers the browser. An account's first browser is simply saved;
 * any later new one sends a "new sign-in" alert by email and in the app.
 */
export async function finishLogin(req: Request, res: Response, user: LoginUser, options: { remember?: boolean } = {}) {
  const device = deviceOf(req, res);
  const label = deviceLabel(req.get("user-agent"));
  const now = new Date();
  const [known, count] = await Promise.all([
    prisma.knownDevice.findUnique({ where: { userId_deviceHash: { userId: user.id, deviceHash: device } }, select: { id: true } }),
    prisma.knownDevice.count({ where: { userId: user.id } }),
  ]);
  const trustedUntil = options.remember ? new Date(now.getTime() + REMEMBER_DAYS * 86400_000) : undefined;
  await prisma.knownDevice.upsert({
    where: { userId_deviceHash: { userId: user.id, deviceHash: device } },
    create: { userId: user.id, deviceHash: device, label, trustedUntil: trustedUntil ?? null },
    update: { lastSeenAt: now, label, ...(trustedUntil && { trustedUntil }) },
  });
  if (!known && count > 0) {
    const body = `${label}, ${when(now)}. If this wasn't you, change your password now in Account.`;
    await notify(user.id, { title: "New sign-in to your account", body, link: "/" }).catch(() => undefined);
    if (!placeholderEmail(user.email)) await sendEmail({
      to: user.email,
      subject: "New sign-in to your Feasto account",
      text: `Someone just signed in to your Feasto account from ${label}, ${when(now)}.\n\nIf it was you, there's nothing to do. If it wasn't, change your password now in Account, and turn on two-step login.`,
      html: emailHtml([`Someone just signed in to your account from <b>${label}</b>, ${when(now)}.`, "If it was you, there's nothing to do.", "If it wasn't, change your password now in Account, and turn on two-step login."]),
    });
  }
  res.cookie(SESSION_COOKIE, await signSession({ userId: user.id, role: user.role, name: user.name }), sessionCookieOptions);
}

/** Several wrong passwords in a row: tell the owner, in case it wasn't them */
export async function warnLockedOut(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  await notify(user.id, { title: "Someone tried to log in to your account", body: "There were several wrong passwords, so logging in is paused for 15 minutes. If it wasn't you, change your password.", link: "/" }).catch(() => undefined);
  if (placeholderEmail(email)) return;
  await sendEmail({
    to: email,
    subject: "Someone tried to log in to your Feasto account",
    text: "There were several wrong passwords for your Feasto account just now, so logging in is paused for 15 minutes.\n\nIf it was you, wait and try again. If it wasn't, change your password and turn on two-step login.",
    html: emailHtml(["There were several wrong passwords for your account just now, so logging in is paused for 15 minutes.", "If it was you, wait and try again.", "If it wasn't, change your password and turn on two-step login."]),
  });
}

// ---------- Checking the code ----------

async function countTry(userId: string) {
  const key = `two-step-tries:${userId}`;
  const tries = await redis.incr(key);
  if (tries === 1) await redis.expire(key, 15 * 60);
  if (tries > MAX_TRIES) throw new HttpError(429, "Too many wrong codes. Wait 15 minutes, then log in again.");
}

const emailCodeKey = (userId: string) => `two-step-email:${userId}`;
const hashCode = (userId: string, code: string) => createHash("sha256").update(Buffer.from(config.jwtSecret)).update(`:two-step-email:${userId}:${code}`).digest("hex");

export type Method = "app" | "backup" | "email";

/** The second step: a code from the app, a backup code, or the code just emailed. Each works once. */
export async function checkSecondStep(token: string, method: Method, code: string) {
  const userId = await readPending(token, "verify");
  await countTry(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, totpEnabledAt: true, totpSecret: true, backupCodes: true, disabledAt: true } });
  if (user.disabledAt) throw new HttpError(403, "This account has been disabled. Please contact Feasto support.");
  const clean = code.replace(/\s/g, "");
  let right = false;
  if (method === "app" && user.totpSecret) right = await useCode(user.id, openSecret(user.totpSecret), clean);
  else if (method === "backup") {
    const left = useBackupCode(user.id, user.backupCodes, clean);
    if (left) {
      // Only if nobody used it at the same moment
      const { count } = await prisma.user.updateMany({ where: { id: user.id, backupCodes: { equals: user.backupCodes } }, data: { backupCodes: left } });
      right = count === 1;
    }
  } else if (method === "email") {
    const saved = await redis.get(emailCodeKey(user.id));
    right = Boolean(saved && /^\d{6}$/.test(clean) && timingSafeEqual(Buffer.from(saved), Buffer.from(hashCode(user.id, clean))));
    if (right) await redis.del(emailCodeKey(user.id));
  }
  if (!right) {
    throw new ValidationError({
      code: [method === "app" ? "That code isn't right. Use the newest one in your authenticator app." : method === "backup" ? "That backup code isn't right, or it was already used." : "That code isn't right, or it expired. Ask for a new one."],
    });
  }
  await redis.del(`two-step-tries:${user.id}`);
  return { user, backupLeft: method === "backup" ? (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { backupCodes: true } })).backupCodes.length : undefined };
}

/** A lost phone: a one-time code by email instead */
export async function emailSecondStep(token: string) {
  const userId = await readPending(token, "verify");
  if (!mailReady()) throw new HttpError(503, "Feasto can't send emails right now. Use a backup code instead.");
  const wait = await redis.ttl(`two-step-email-wait:${userId}`);
  if (wait > 0) throw new HttpError(429, `A code was just sent. You can ask for another in ${wait} seconds.`);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await redis.set(emailCodeKey(userId), hashCode(userId, code), "EX", CODE_MINUTES * 60);
  await redis.set(`two-step-email-wait:${userId}`, "1", "EX", 60);
  const sent = await sendEmail({
    to: user.email,
    subject: `${code} is your Feasto login code`,
    text: `Your Feasto login code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you're not logging in, change your password: someone has it.`,
    html: emailHtml(["Your code to finish logging in:", `It works for ${CODE_MINUTES} minutes. If you're not logging in, change your password: someone has it.`], code),
  });
  if (!sent) throw new HttpError(502, "We couldn't send the code just now. Use a backup code, or try again in a moment.");
  return { minutes: CODE_MINUTES };
}

// ---------- Setting up the app ----------

const setupKey = (userId: string) => `two-step-setup:${userId}`;

/** A new secret to scan, kept aside until the first code proves the app has it */
export async function startSetup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const secret = newSecret();
  await redis.set(setupKey(userId), sealSecret(secret), "EX", 15 * 60);
  return { otpauthUrl: otpauthUrl(secret, user.email), secret: base32(secret).replace(/(.{4})/g, "$1 ").trim() };
}

/** The first code from the app turns two-step login on, and gives the backup codes (shown once) */
export async function confirmSetup(userId: string, code: string) {
  await countTry(userId);
  const sealed = await redis.get(setupKey(userId));
  if (!sealed) throw new HttpError(410, "The QR code expired. Start again to get a new one.");
  if (!(await useCode(userId, openSecret(sealed), code.replace(/\s/g, "")))) {
    throw new ValidationError({ code: ["That code isn't right. Type the 6 digits your app shows for Feasto now."] });
  }
  const backup = newBackupCodes(userId);
  await prisma.user.update({ where: { id: userId }, data: { totpSecret: sealed, totpEnabledAt: new Date(), backupCodes: backup.hashes } });
  await redis.del(setupKey(userId), `two-step-tries:${userId}`);
  return backup.codes;
}

/** Setting up during a required login: the pending token stands in for the session */
export const setupUserOf = (token: string) => readPending(token, "setup");

/** New backup codes; the old ones stop working */
export async function renewBackupCodes(userId: string) {
  const backup = newBackupCodes(userId);
  await prisma.user.update({ where: { id: userId }, data: { backupCodes: backup.hashes } });
  return backup.codes;
}

/** For someone logged in, a code from their app (to turn it off or get new backup codes) */
export async function checkOwnCode(userId: string, code: string) {
  await countTry(userId);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecret: true } });
  if (!user.totpSecret || !(await useCode(userId, openSecret(user.totpSecret), code.replace(/\s/g, "")))) {
    throw new ValidationError({ code: ["That code isn't right. Use the newest one in your authenticator app."] });
  }
  await redis.del(`two-step-tries:${userId}`);
}
