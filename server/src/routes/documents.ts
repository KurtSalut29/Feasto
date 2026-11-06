import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { documentKind, notifyStoreOfRider, permitFields, riderFields, storeForCode } from "../lib/verification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { detectImageType } from "./uploads.js";

/**
 * Business permits and driver's licenses. They hold personal details, so unlike photos they
 * aren't in the folder Nginx serves: each file goes out through here, to the admin, its
 * owner, or (for a rider's license) the store the rider applied to.
 */
export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const MAX_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as const;

/** Recognise the file from its first bytes rather than trusting its name. */
const detectDocumentType = (data: Buffer) => (data.toString("ascii", 0, 5) === "%PDF-" ? "pdf" : detectImageType(data));

const removeFile = (name: string | null) => (name ? rm(path.join(config.documentDir, name), { force: true }) : undefined);

/** Sends one private document. The browser shows it but mustn't keep a copy. */
async function sendDocument(res: express.Response, name: string) {
  const extension = path.extname(name).slice(1) as keyof typeof CONTENT_TYPE;
  const data = await readFile(path.join(config.documentDir, name));
  res.set({ "Content-Type": CONTENT_TYPE[extension], "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(data);
}

/** Documents can only change before approval; a reviewed one stays what was checked. */
const EDITABLE = ["PENDING", "REJECTED"] as const;

/** A store's permit or a rider's license, uploaded by its owner. */
documentsRouter.put(
  "/mine",
  requireRole("VENDOR", "RIDER"),
  express.raw({ type: Object.values(CONTENT_TYPE), limit: MAX_BYTES }),
  async (req, res) => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Choose a photo or PDF of the document.");
    const extension = detectDocumentType(data);
    if (!extension) throw new HttpError(400, "That file isn't a JPG, PNG, WebP or PDF.");

    const name = `${randomBytes(16).toString("hex")}.${extension}`;
    await mkdir(config.documentDir, { recursive: true });
    await writeFile(path.join(config.documentDir, name), data);

    const userId = req.session!.userId;
    const previous =
      req.session!.role === "VENDOR"
        ? (await prisma.vendor.findUnique({ where: { ownerId: userId }, select: { permitFile: true } }))?.permitFile
        : (await prisma.riderProfile.findUnique({ where: { userId }, select: { licenseFile: true } }))?.licenseFile;
    const { count } =
      req.session!.role === "VENDOR"
        ? await prisma.vendor.updateMany({ where: { ownerId: userId, status: { in: [...EDITABLE] } }, data: { permitFile: name } })
        : await prisma.riderProfile.updateMany({ where: { userId, status: { in: [...EDITABLE] } }, data: { licenseFile: name } });
    if (count === 0) {
      await removeFile(name);
      throw new HttpError(409, "This document was already reviewed, so it can't be changed now.");
    }
    await removeFile(previous ?? null);
    res.json({ document: documentKind(name) });
  },
);

documentsRouter.get("/store/:id", async (req, res) => {
  const store = await prisma.vendor.findUnique({ where: { id: String(req.params.id) }, select: { ownerId: true, permitFile: true } });
  const allowed = req.session!.role === "ADMIN" || store?.ownerId === req.session!.userId;
  // The same answer for "not yours" and "doesn't exist", so ids can't be probed
  if (!store?.permitFile || !allowed) throw new HttpError(404, "Document not found.");
  await sendDocument(res, store.permitFile);
});

documentsRouter.get("/rider/:id", async (req, res) => {
  const rider = await prisma.riderProfile.findUnique({
    where: { id: String(req.params.id) },
    select: { userId: true, licenseFile: true, vendor: { select: { ownerId: true } } },
  });
  const userId = req.session!.userId;
  const allowed = req.session!.role === "ADMIN" || rider?.userId === userId || rider?.vendor?.ownerId === userId;
  if (!rider?.licenseFile || !allowed) throw new HttpError(404, "Document not found.");
  await sendDocument(res, rider.licenseFile);
});

// ---------- The applicant's own details ----------

/** Dates as YYYY-MM-DD for the form's date boxes. */
const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10) ?? "";

documentsRouter.get("/verification", requireRole("VENDOR", "RIDER"), async (req, res) => {
  const userId = req.session!.userId;
  if (req.session!.role === "VENDOR") {
    const store = await prisma.vendor.findUniqueOrThrow({ where: { ownerId: userId } });
    res.json({
      id: store.id,
      status: store.status,
      reviewNote: store.reviewNote,
      document: documentKind(store.permitFile),
      fields: {
        businessName: store.businessName ?? "",
        businessPhone: store.businessPhone ?? "",
        permitNumber: store.permitNumber ?? "",
        permitExpiresAt: dateOnly(store.permitExpiresAt),
      },
    });
    return;
  }
  const rider = await prisma.riderProfile.findUniqueOrThrow({
    where: { userId },
    include: { vendor: { select: { name: true, riderCode: true } } },
  });
  res.json({
    id: rider.id,
    status: rider.status,
    reviewNote: rider.reviewNote,
    document: documentKind(rider.licenseFile),
    storeName: rider.vendor?.name ?? null,
    fields: {
      birthDate: dateOnly(rider.birthDate),
      address: rider.address ?? "",
      emergencyName: rider.emergencyName ?? "",
      emergencyPhone: rider.emergencyPhone ?? "",
      vehicleModel: rider.vehicleModel ?? "",
      plateNumber: rider.plateNumber ?? "",
      licenseNumber: rider.licenseNumber ?? "",
      licenseExpiresAt: dateOnly(rider.licenseExpiresAt),
      storeCode: rider.vendor?.riderCode ?? "",
    },
  });
});

/** Saves corrected details. After a rejection this sends the application back for review. */
documentsRouter.patch("/verification", requireRole("VENDOR", "RIDER"), async (req, res) => {
  const userId = req.session!.userId;
  // A rejected application returns to the queue with its old reason cleared
  const back = (status: string, hasFile: boolean) => {
    if (status === "REJECTED" && !hasFile) throw new HttpError(409, "Upload the document first.");
    return status === "REJECTED" ? { status: "PENDING" as const, reviewNote: null, reviewedAt: null } : {};
  };

  if (req.session!.role === "VENDOR") {
    const input = parseBody(z.object(permitFields), req.body);
    const store = await prisma.vendor.findUniqueOrThrow({ where: { ownerId: userId }, select: { status: true, permitFile: true } });
    if (store.status !== "PENDING" && store.status !== "REJECTED") throw new HttpError(409, "These details were already reviewed.");
    await prisma.vendor.update({ where: { ownerId: userId }, data: { ...input, ...back(store.status, Boolean(store.permitFile)) } });
    res.json({ ok: true });
    return;
  }

  const { storeCode, ...input } = parseBody(z.object(riderFields), req.body);
  const rider = await prisma.riderProfile.findUniqueOrThrow({
    where: { userId },
    select: { status: true, licenseFile: true, vendorId: true, user: { select: { name: true } } },
  });
  if (rider.status !== "PENDING" && rider.status !== "REJECTED") throw new HttpError(409, "These details were already reviewed.");
  const store = storeCode ? await storeForCode(storeCode) : null;
  try {
    await prisma.riderProfile.update({
      where: { userId },
      data: { ...input, vendorId: store?.id ?? null, ...back(rider.status, Boolean(rider.licenseFile)) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ValidationError({ licenseNumber: ["This license number is already registered to another rider."] });
    }
    throw error;
  }
  if (store && (rider.status === "REJECTED" || rider.vendorId !== store.id)) await notifyStoreOfRider(store.ownerId, rider.user.name);
  res.json({ ok: true });
});
