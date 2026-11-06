import { Router } from "express";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { notify } from "../lib/realtime.js";
import { documentKind, newRiderCode, reviewRider, reviewSchema } from "../lib/verification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

/**
 * A store's own riders: they sign up with the store's code, and the store checks their license
 * and approves them. Free riders, who have no store, are reviewed by the admin instead.
 */
export const vendorRidersRouter = Router();
vendorRidersRouter.use(requireAuth, requireRole("VENDOR"));

vendorRidersRouter.get("/riders", async (req, res) => {
  const store = await prisma.vendor.findUniqueOrThrow({
    where: { ownerId: req.session!.userId },
    select: {
      riderCode: true,
      status: true,
      riders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          vehicleModel: true,
          plateNumber: true,
          licenseNumber: true,
          licenseExpiresAt: true,
          licenseFile: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          suspendedByAdmin: true,
          isOnline: true,
          createdAt: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      },
    },
  });
  res.json({
    code: store.riderCode,
    storeStatus: store.status,
    riders: store.riders.map(({ licenseFile, ...rider }) => ({ ...rider, document: documentKind(licenseFile) })),
  });
});

vendorRidersRouter.post("/riders/:id/review", async (req, res) => {
  const input = parseBody(reviewSchema, req.body);
  await reviewRider(String(req.params.id), input, { vendorId: await myVendorId(req.session!.userId) });
  res.json({ ok: true });
});

/** The rider stops working for this store and asks the admin to review them as a free rider. */
vendorRidersRouter.post("/riders/:id/remove", async (req, res) => {
  const id = String(req.params.id);
  const vendorId = await myVendorId(req.session!.userId);
  const rider = await prisma.riderProfile.findFirst({ where: { id, vendorId }, select: { userId: true, suspendedByAdmin: true, vendor: { select: { name: true } } } });
  if (!rider) throw new HttpError(404, "This rider isn't part of your store.");
  if (rider.suspendedByAdmin) throw new HttpError(403, "The Feasto admin suspended this rider, so only the admin can change this.");
  const busy = await prisma.order.count({ where: { riderId: rider.userId, status: { in: ["ACCEPTED", "PREPARING", "READY", "PICKED_UP"] } } });
  if (busy > 0) throw new HttpError(409, "This rider is on a delivery. Try again when it's finished.");

  await prisma.riderProfile.update({
    where: { id },
    data: { vendorId: null, status: "PENDING", reviewNote: null, reviewedAt: null, isOnline: false },
  });
  await notify(rider.userId, {
    title: `You're no longer a rider for ${rider.vendor?.name}`,
    body: "A Feasto admin will review your account so you can ride as a free rider.",
    link: "/rider",
  });
  res.json({ ok: true });
});

/** A new code, in case the old one reached the wrong people. Riders who already joined stay. */
vendorRidersRouter.post("/rider-code", async (req, res) => {
  const { riderCode } = await prisma.vendor.update({
    where: { ownerId: req.session!.userId },
    data: { riderCode: newRiderCode() },
    select: { riderCode: true },
  });
  res.json({ code: riderCode });
});
