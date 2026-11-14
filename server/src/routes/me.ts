import { Router } from "express";
import { z } from "zod";
import { markPasswordChanged } from "../lib/accounts.js";
import { hashPassword, SESSION_COOKIE, sessionCookieOptions, signSession, verifyPassword } from "../lib/auth.js";
import { prisma } from "../lib/db.js";
import { PIN_MESSAGE, pinFields, pinIsWhole } from "../lib/geo.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { clearFailedLogins, loginLockSeconds, recordFailedLogin } from "../lib/rateLimit.js";
import { CHANNELS } from "../lib/liveUpdates.js";
import { openStream, pollOnce } from "../lib/liveUpdateStreams.js";
import { pushEnabled, pushTo } from "../lib/push.js";
import { config } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { newPassword } from "./auth.js";

/** Things every signed-in user does with their own account. */
export const meRouter = Router();
meRouter.use(requireAuth);

// ---------- Live updates ----------

function liveChannels(session: NonNullable<Express.Request["session"]>) {
  const channels = [CHANNELS.user(session.userId)];
  if (session.role === "RIDER") channels.push(CHANNELS.riders);
  if (session.role === "ADMIN") channels.push(CHANNELS.admin);
  return channels;
}

meRouter.get("/events", async (req, res) => {
  await openStream(res, liveChannels(req.session!));
});

// The same updates for browsers whose connection can't stream (e.g. through a quick tunnel)
meRouter.get("/events/poll", (req, res) => {
  pollOnce(res, liveChannels(req.session!));
});

// ---------- Push notifications (while Feasto is closed) ----------

// The key a browser needs to sign up, and whether this server sends pushes at all
meRouter.get("/push", (_req, res) => {
  res.json({ enabled: pushEnabled, publicKey: pushEnabled ? config.vapid.publicKey : null });
});

const pushDevice = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

// Turns them on for this browser. A browser shared by two accounts gets the one signed in now.
meRouter.post("/push", async (req, res) => {
  if (!pushEnabled) throw new HttpError(503, "Notifications on your phone aren't set up on this server.");
  const { endpoint, keys } = parseBody(pushDevice, req.body);
  const userId = req.session!.userId;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.status(204).end();
});

// A test message to every device this person turned them on in, shown even with Feasto open
meRouter.post("/push/test", async (req, res) => {
  const sent = await pushTo(req.session!.userId, {
    title: "Notifications are working",
    body: "This is how Feasto will tell you about orders, jobs and messages.",
    link: "/",
    tag: "test",
    always: true,
  });
  if (!sent) throw new HttpError(409, "No device got it. Turn notifications on again on this device.");
  res.json({ sent });
});

// Turns them off for this browser (also when logging out, so the next person doesn't get them)
meRouter.delete("/push", async (req, res) => {
  const { endpoint } = parseBody(z.object({ endpoint: z.string().max(1000) }), req.body);
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.session!.userId } });
  res.status(204).end();
});

// ---------- Profile ----------

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^(\+639|09)\d{9}$/, "Enter a mobile number like 09171234567."),
});

meRouter.patch("/profile", async (req, res) => {
  const input = parseBody(profileSchema, req.body);
  await prisma.user.update({ where: { id: req.session!.userId }, data: input });
  res.json({ ok: true });
});

// ---------- Display & accessibility ----------

/** Text size, contrast, motion, button size and map style: applied on every device the person logs in on */
const displaySelect = { textSize: true, highContrast: true, reduceMotion: true, largeTargets: true, mapStyle: true } as const;

/** Only what's sent changes, so a map can save its style without knowing the other settings */
const displaySchema = z
  .object({
    textSize: z.enum(["NORMAL", "LARGE", "XLARGE"], "Choose a text size."),
    highContrast: z.boolean(),
    reduceMotion: z.boolean(),
    largeTargets: z.boolean(),
    mapStyle: z.enum(["DEFAULT", "SATELLITE", "NIGHT"], "Choose a map style."),
  })
  .partial();

meRouter.get("/display", async (req, res) => {
  const display = await prisma.user.findUniqueOrThrow({ where: { id: req.session!.userId }, select: displaySelect });
  res.json({ display });
});

meRouter.put("/display", async (req, res) => {
  const input = parseBody(displaySchema, req.body);
  const display = await prisma.user.update({ where: { id: req.session!.userId }, data: input, select: displaySelect });
  res.json({ display });
});

// ---------- Password ----------

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword,
  })
  .refine((input) => input.newPassword !== input.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  });

/**
 * Change the password. Every other device is logged out: their cookies were signed before
 * passwordChangedAt, which all API copies check through Redis. This browser gets a fresh cookie.
 */
meRouter.patch("/password", async (req, res) => {
  const input = parseBody(passwordSchema, req.body);
  const session = req.session!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { email: true, passwordHash: true } });

  // Wrong guesses count toward the same lock as failed logins, so this can't be used to guess passwords
  const lockSeconds = await loginLockSeconds(user.email);
  if (lockSeconds > 0) throw new HttpError(429, `Too many wrong attempts. Try again in ${Math.ceil(lockSeconds / 60)} minute(s).`);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    await recordFailedLogin(user.email);
    throw new ValidationError({ currentPassword: ["That isn't your current password."] });
  }
  await clearFailedLogins(user.email);

  const changedAt = new Date();
  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: changedAt },
  });
  await markPasswordChanged(session.userId, changedAt);
  res.cookie(SESSION_COOKIE, await signSession(session), sessionCookieOptions);
  res.json({ ok: true });
});

// ---------- Notifications ----------

meRouter.get("/notifications", async (req, res) => {
  const userId = req.session!.userId;
  // The bell shows the latest 30; the notifications page asks for up to 100
  const take = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ notifications, unread });
});

meRouter.post("/notifications/read-all", async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.session!.userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

// ---------- Delivery addresses (residents) ----------

const addressSchema = z
  .object({
    label: z.string().trim().min(1, "Give it a name, like Home.").max(30),
    details: z.string().trim().min(5, "Enter the street, barangay and city.").max(200),
    landmark: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => v || null),
    isDefault: z.boolean().optional(),
    ...pinFields,
  })
  .refine(pinIsWhole, PIN_MESSAGE);

meRouter.get("/addresses", requireRole("RESIDENT"), async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.session!.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  res.json({ addresses });
});

meRouter.post("/addresses", requireRole("RESIDENT"), async (req, res) => {
  const input = parseBody(addressSchema, req.body);
  const userId = req.session!.userId;

  const address = await prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } });
    if (count >= 10) throw new HttpError(400, "You can save up to 10 addresses.");
    // The first address is the default; making another the default unsets the old one
    const isDefault = count === 0 || Boolean(input.isDefault);
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...input, isDefault, userId } });
  });
  res.status(201).json({ address });
});

meRouter.patch("/addresses/:id", requireRole("RESIDENT"), async (req, res) => {
  const input = parseBody(addressSchema, req.body);
  const userId = req.session!.userId;
  const id = String(req.params.id);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "We couldn't find this address. It may have been deleted.");
    if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.address.update({
      where: { id },
      data: { ...input, isDefault: input.isDefault ? true : existing.isDefault },
    });
  });
  res.json({ ok: true });
});

meRouter.delete("/addresses/:id", requireRole("RESIDENT"), async (req, res) => {
  const userId = req.session!.userId;
  const id = String(req.params.id);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId } });
    if (!existing) throw new HttpError(404, "We couldn't find this address. It may have been deleted.");
    await tx.address.delete({ where: { id } });
    // Keep one default if any addresses remain
    if (existing.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  res.status(204).end();
});
