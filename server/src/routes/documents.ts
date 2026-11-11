import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { Prisma } from "../generated/prisma/client.js";
import { logActivity, notifyAdmin } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody, ValidationError } from "../lib/http.js";
import { notify } from "../lib/liveUpdates.js";
import { hasExpired, removeDocument } from "../lib/renewals.js";
import { documentKind, notifyStoreOfRider, permitFields, riderFields, storeForCode } from "../lib/verification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { perAccount } from "../lib/rateLimit.js";
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
  // Counted before the file is read, so a flood of uploads costs nothing
  perAccount("upload", 30, 600, "You've uploaded a lot of files just now."),
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
      await removeDocument(name);
      throw new HttpError(409, "This document was already reviewed, so it can't be changed now.");
    }
    await removeDocument(previous);
    res.json({ document: documentKind(name) });
  },
);

documentsRouter.get("/store/:id", async (req, res) => {
  const store = await prisma.vendor.findUnique({ where: { id: String(req.params.id) }, select: { ownerId: true, permitFile: true } });
  const allowed = req.session!.role === "ADMIN" || store?.ownerId === req.session!.userId;
  // The same answer for "not yours" and "doesn't exist", so ids can't be probed
  if (!store?.permitFile || !allowed) throw new HttpError(404, "We couldn't find this document. It may have been replaced or removed.");
  await sendDocument(res, store.permitFile);
});

documentsRouter.get("/rider/:id", async (req, res) => {
  const rider = await prisma.riderProfile.findUnique({
    where: { id: String(req.params.id) },
    select: { userId: true, licenseFile: true, vendor: { select: { ownerId: true } } },
  });
  const userId = req.session!.userId;
  const allowed = req.session!.role === "ADMIN" || rider?.userId === userId || rider?.vendor?.ownerId === userId;
  if (!rider?.licenseFile || !allowed) throw new HttpError(404, "We couldn't find this document. It may have been replaced or removed.");
  await sendDocument(res, rider.licenseFile);
});

// ---------- Renewing a document after approval ----------

/** Whose renewal this is, for the signed-in store or rider. */
async function renewalOwner(session: { userId: string; role: string; name: string }) {
  if (session.role === "VENDOR") {
    const store = await prisma.vendor.findUniqueOrThrow({
      where: { ownerId: session.userId },
      select: { id: true, name: true, status: true, permitNumber: true, permitExpiresAt: true, permitFile: true },
    });
    return {
      where: { vendorId: store.id },
      kind: "permit" as const,
      id: store.id,
      name: store.name,
      status: store.status,
      number: store.permitNumber,
      expiresAt: store.permitExpiresAt,
      file: store.permitFile,
      reviewerName: "the Feasto admin",
      storeOwnerId: null,
    };
  }
  const rider = await prisma.riderProfile.findUniqueOrThrow({
    where: { userId: session.userId },
    select: { id: true, status: true, licenseNumber: true, licenseExpiresAt: true, licenseFile: true, vendor: { select: { name: true, ownerId: true } } },
  });
  return {
    where: { riderId: rider.id },
    kind: "license" as const,
    id: rider.id,
    name: session.name,
    status: rider.status,
    number: rider.licenseNumber,
    expiresAt: rider.licenseExpiresAt,
    file: rider.licenseFile,
    reviewerName: rider.vendor?.name ?? "the Feasto admin",
    storeOwnerId: rider.vendor?.ownerId ?? null,
  };
}

const CAN_RENEW = ["APPROVED", "SUSPENDED"];
const OPEN = { in: ["DRAFT", "PENDING"] } as Prisma.EnumRenewalStatusFilter;

documentsRouter.get("/renewal", requireRole("VENDOR", "RIDER"), async (req, res) => {
  const owner = await renewalOwner(req.session!);
  const latest = await prisma.documentRenewal.findFirst({
    where: { ...owner.where, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, expiresAt: true, file: true, status: true, note: true, submittedAt: true },
  });
  res.json({
    kind: owner.kind,
    id: owner.id,
    status: owner.status,
    number: owner.number,
    expiresAt: owner.expiresAt,
    expired: hasExpired(owner.expiresAt),
    document: documentKind(owner.file),
    reviewerName: owner.reviewerName,
    canRenew: CAN_RENEW.includes(owner.status),
    renewal: latest && latest.status !== "APPROVED" ? { ...latest, file: undefined, document: documentKind(latest.file) } : null,
  });
});

/** Holds the new file aside until it's submitted, and then until it's approved. */
documentsRouter.put(
  "/renewal/file",
  requireRole("VENDOR", "RIDER"),
  // Counted before the file is read, so a flood of uploads costs nothing
  perAccount("upload", 30, 600, "You've uploaded a lot of files just now."),
  express.raw({ type: Object.values(CONTENT_TYPE), limit: MAX_BYTES }),
  async (req, res) => {
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, "Choose a photo or PDF of the document.");
    const extension = detectDocumentType(data);
    if (!extension) throw new HttpError(400, "That file isn't a JPG, PNG, WebP or PDF.");
    const owner = await renewalOwner(req.session!);
    if (!CAN_RENEW.includes(owner.status)) throw new HttpError(409, "Your application hasn't been approved yet, so change the document in your application instead.");
    const open = await prisma.documentRenewal.findFirst({ where: { ...owner.where, status: OPEN }, select: { id: true, status: true, file: true } });
    if (open?.status === "PENDING") throw new HttpError(409, "Your renewal is already being reviewed.");

    const name = `${randomBytes(16).toString("hex")}.${extension}`;
    await mkdir(config.documentDir, { recursive: true });
    await writeFile(path.join(config.documentDir, name), data);
    try {
      if (open) await prisma.documentRenewal.update({ where: { id: open.id }, data: { file: name } });
      else await prisma.documentRenewal.create({ data: { ...owner.where, file: name } });
    } catch (error) {
      await removeDocument(name);
      // Two uploads at the same moment: the unique index lets one in
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new HttpError(409, "Another upload of this document was still finishing. Upload it again.");
      throw error;
    }
    await removeDocument(open?.file);
    res.json({ document: documentKind(name) });
  },
);

/** Sends the new details and the file already uploaded to whoever reviews this owner. */
documentsRouter.post("/renewal", requireRole("VENDOR", "RIDER"), async (req, res) => {
  const owner = await renewalOwner(req.session!);
  if (!CAN_RENEW.includes(owner.status)) throw new HttpError(409, "Your application hasn't been approved yet, so change the document in your application instead.");
  const { number, expiresAt } = parseBody(
    z.object(
      owner.kind === "permit"
        ? { number: permitFields.permitNumber, expiresAt: permitFields.permitExpiresAt }
        : { number: riderFields.licenseNumber, expiresAt: riderFields.licenseExpiresAt },
    ),
    req.body,
  );
  if (owner.expiresAt && expiresAt <= owner.expiresAt) {
    throw new ValidationError({ expiresAt: ["The new expiry date must be later than the one on file."] });
  }

  const documentName = owner.kind === "permit" ? "business permit" : "driver's license";
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.documentRenewal.updateMany({
      where: { ...owner.where, status: "DRAFT", file: { not: null } },
      data: { number, expiresAt, status: "PENDING", note: null, submittedAt: new Date() },
    });
    if (count === 0) throw new HttpError(409, `Upload your renewed ${documentName} first.`);
    await logActivity(tx, { userId: req.session!.userId, name: req.session!.name }, { category: "DOCUMENTS", action: `Submitted renewed ${documentName}`, target: owner.name });
  });

  const message = { title: `${owner.name} renewed their ${documentName}`, body: "Check the new document and approve or reject it." };
  if (owner.storeOwnerId) await notify(owner.storeOwnerId, { ...message, link: "/vendor/riders" });
  else await notifyAdmin({ ...message, link: "/admin/documents" });
  res.status(201).json({ ok: true });
});

/** The new document, for the people who may see the one it replaces. */
documentsRouter.get("/renewal/:id/file", async (req, res) => {
  const renewal = await prisma.documentRenewal.findUnique({
    where: { id: String(req.params.id) },
    select: { file: true, vendor: { select: { ownerId: true } }, rider: { select: { userId: true, vendor: { select: { ownerId: true } } } } },
  });
  const userId = req.session!.userId;
  const allowed = req.session!.role === "ADMIN" || renewal?.vendor?.ownerId === userId || renewal?.rider?.userId === userId || renewal?.rider?.vendor?.ownerId === userId;
  if (!renewal?.file || !allowed) throw new HttpError(404, "We couldn't find this document. It may have been replaced or removed.");
  await sendDocument(res, renewal.file);
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
