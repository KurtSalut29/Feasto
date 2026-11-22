import { randomBytes, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { logActivity, notifyAdmin } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { notify } from "../lib/liveUpdates.js";
import { perAccount } from "../lib/rateLimit.js";
import { redis } from "../lib/redis.js";
import { removeDocument } from "../lib/renewals.js";
import { detectImageType } from "./uploads.js";
import { MAX_BYTES, sendDocument } from "./documents.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * Level 3 of the ID check, for riders (they carry other people's food and cash): a selfie doing what
 * Feasto asks right then, e.g. "hold up 3 fingers", so it's a live person and not an old photo, for
 * the admin to compare with the license photo. eGov's Face Liveness can replace the admin's look once
 * Feasto is approved; until then the admin decides.
 */

const CHALLENGES = [
  "Hold up 3 fingers next to your face",
  "Give a thumbs up next to your face",
  "Touch your nose with one finger",
  "Cover one eye with your hand",
  "Hold up 2 fingers (a peace sign)",
  "Put your hand on top of your head",
];
/** The selfie must follow the challenge within this */
const CHALLENGE_SECONDS = 10 * 60;
const challengeKey = (userId: string) => `selfie-challenge:${userId}`;

export const riderSelfieRouter = Router();
riderSelfieRouter.use(requireAuth, requireRole("RIDER"));

riderSelfieRouter.get("/", async (req, res) => {
  const p = await prisma.riderProfile.findUniqueOrThrow({ where: { userId: req.session!.userId }, select: { livenessStatus: true, livenessNote: true, selfieAt: true, selfieChallenge: true } });
  const open = await redis.get(challengeKey(req.session!.userId));
  res.json({ status: p.livenessStatus, note: p.livenessNote, selfieAt: p.selfieAt, challenge: open });
});

/** A new challenge, good for 10 minutes */
riderSelfieRouter.post("/challenge", perAccount("selfie-challenge", 10, 3600, "Too many tries just now. Try again later."), async (req, res) => {
  const challenge = CHALLENGES[randomInt(CHALLENGES.length)]!;
  await redis.set(challengeKey(req.session!.userId), challenge, "EX", CHALLENGE_SECONDS);
  res.json({ challenge, seconds: CHALLENGE_SECONDS });
});

/** The selfie, taken with the challenge still open. Kept private, like the license. */
riderSelfieRouter.put(
  "/",
  perAccount("upload", 30, 600, "You've uploaded a lot of files just now."),
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_BYTES }),
  async (req, res) => {
    const userId = req.session!.userId;
    const challenge = await redis.get(challengeKey(userId));
    if (!challenge) throw new HttpError(409, "Get a new challenge first: the last one ran out after 10 minutes.");
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Take the selfie first.");
    const extension = detectImageType(data);
    if (!extension) throw new HttpError(400, "That isn't a photo (JPG, PNG or WebP).");
    const name = `${randomBytes(16).toString("hex")}.${extension}`;
    await mkdir(config.documentDir, { recursive: true });
    await writeFile(path.join(config.documentDir, name), data);
    const before = await prisma.riderProfile.findUniqueOrThrow({ where: { userId }, select: { selfieFile: true } });
    await prisma.riderProfile.update({ where: { userId }, data: { selfieFile: name, selfieChallenge: challenge, selfieAt: new Date(), livenessStatus: "PENDING", livenessNote: null, livenessCheckedAt: null } });
    await redis.del(challengeKey(userId));
    if (before.selfieFile) await removeDocument(before.selfieFile);
    await notifyAdmin({ title: "A rider's selfie to check", body: `${req.session!.name}: "${challenge}". Compare it with their license photo.`, link: "/admin/approvals#selfies" });
    res.json({ status: "PENDING" });
  },
);

// ---------- The admin's side ----------

export const adminSelfieRouter = Router();
adminSelfieRouter.use(requireAuth, requireRole("ADMIN"));

adminSelfieRouter.get("/", async (_req, res) => {
  const riders = await prisma.riderProfile.findMany({
    where: { selfieFile: { not: null } },
    orderBy: [{ livenessStatus: "asc" }, { selfieAt: "desc" }],
    take: 50,
    select: { id: true, userId: true, selfieChallenge: true, selfieAt: true, livenessStatus: true, livenessNote: true, licenseFile: true, user: { select: { name: true } } },
  });
  res.json({ riders: riders.map(({ licenseFile, ...r }) => ({ ...r, hasLicense: Boolean(licenseFile) })) });
});

/** The selfie itself, for the admin only */
adminSelfieRouter.get("/:riderId/photo", async (req, res) => {
  const p = await prisma.riderProfile.findUnique({ where: { id: String(req.params.riderId) }, select: { selfieFile: true } });
  if (!p?.selfieFile) throw new HttpError(404, "We couldn't find this selfie.");
  await sendDocument(res, p.selfieFile);
});

adminSelfieRouter.post("/:riderId/review", async (req, res) => {
  const input = parseBody(
    z.discriminatedUnion("decision", [
      z.object({ decision: z.literal("VERIFIED") }),
      z.object({ decision: z.literal("REJECTED"), note: z.string().trim().min(5, "Say what's wrong, so they can take a new one (at least 5 letters).").max(200) }),
    ]),
    req.body,
  );
  const p = await prisma.riderProfile.findUnique({ where: { id: String(req.params.riderId) }, select: { userId: true, selfieFile: true, user: { select: { name: true } } } });
  if (!p?.selfieFile) throw new HttpError(404, "That rider has no selfie to check.");
  await prisma.$transaction(async (tx) => {
    await tx.riderProfile.update({
      where: { id: String(req.params.riderId) },
      data: { livenessStatus: input.decision, livenessNote: input.decision === "REJECTED" ? input.note : null, livenessCheckedAt: new Date() },
    });
    await logActivity(tx, { userId: req.session!.userId, name: req.session!.name }, { category: "DOCUMENTS", action: input.decision === "VERIFIED" ? "Confirmed a rider's selfie" : "Turned down a rider's selfie", target: p.user.name });
  });
  await notify(p.userId, {
    title: input.decision === "VERIFIED" ? "Your selfie check is done" : "Take a new selfie",
    body: input.decision === "VERIFIED" ? "The admin matched your selfie with your license. Thank you!" : `The admin couldn't match it: ${input.decision === "REJECTED" ? input.note : ""}`,
    link: "/rider/license",
  });
  res.json({ ok: true });
});
