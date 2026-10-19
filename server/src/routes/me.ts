import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { CHANNELS } from "../lib/realtime.js";
import { openStream } from "../lib/sse.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** Things every signed-in user does with their own account. */
export const meRouter = Router();
meRouter.use(requireAuth);

// ---------- Live updates ----------

meRouter.get("/events", async (req, res) => {
  const { userId, role } = req.session!;
  const channels = [CHANNELS.user(userId)];
  if (role === "RIDER") channels.push(CHANNELS.riders);
  await openStream(res, channels);
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

// ---------- Notifications ----------

meRouter.get("/notifications", async (req, res) => {
  const userId = req.session!.userId;
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
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

const addressSchema = z.object({
  label: z.string().trim().min(1, "Give it a name, like Home.").max(30),
  details: z.string().trim().min(5, "Enter the street, barangay and city.").max(200),
  landmark: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  isDefault: z.boolean().optional(),
});

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
    if (!existing) throw new HttpError(404, "Address not found.");
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
    if (!existing) throw new HttpError(404, "Address not found.");
    await tx.address.delete({ where: { id } });
    // Keep one default if any addresses remain
    if (existing.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  res.status(204).end();
});
