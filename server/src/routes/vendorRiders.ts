import { Router, type Request } from "express";
import { logActivity } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { BUSY, forgetRiderPosition } from "../lib/dispatch.js";
import { HttpError, parseBody } from "../lib/http.js";
import { manilaStartOfDay } from "../lib/storeHours.js";
import { notify } from "../lib/liveUpdates.js";
import { renewalReviewSchema, reviewRenewal } from "../lib/renewals.js";
import { documentKind, newRiderCode, reviewRider, reviewSchema } from "../lib/verification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

/**
 * A store's own riders: they sign up with the store's code, and the store checks their license
 * and approves them. Free riders, who have no store, are reviewed by the admin instead.
 */
export const vendorRidersRouter = Router();
vendorRidersRouter.use(requireAuth, requireRole("VENDOR"));

const actorOf = (req: Request) => ({ userId: req.session!.userId, name: req.session!.name });

vendorRidersRouter.get("/riders", async (req, res) => {
  const store = await prisma.vendor.findUniqueOrThrow({
    where: { ownerId: req.session!.userId },
    select: {
      id: true,
      riderCode: true,
      status: true,
      riders: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
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
          ratingSum: true,
          ratingCount: true,
          createdAt: true,
          user: { select: { name: true, email: true, phone: true } },
          renewals: { where: { status: "PENDING" }, select: { id: true, number: true, expiresAt: true, file: true, submittedAt: true } },
        },
      },
    },
  });
  // How much each rider has delivered for this store, and the order they're on now
  const userIds = store.riders.map((r) => r.userId);
  const [allTime, today, busy] = userIds.length
    ? await Promise.all([
        prisma.order.groupBy({ by: ["riderId"], where: { vendorId: store.id, riderId: { in: userIds }, status: "DELIVERED" }, _count: { _all: true } }),
        prisma.order.groupBy({
          by: ["riderId"],
          where: { vendorId: store.id, riderId: { in: userIds }, status: "DELIVERED", finishedAt: { gte: manilaStartOfDay() } },
          _count: { _all: true },
        }),
        prisma.order.findMany({ where: { riderId: { in: userIds }, status: { in: BUSY } }, select: { id: true, riderId: true, status: true, vendorId: true } }),
      ])
    : [[], [], []];
  const countOf = (rows: { riderId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.riderId === id)?._count._all ?? 0;

  res.json({
    code: store.riderCode,
    storeStatus: store.status,
    riders: store.riders.map(({ licenseFile, renewals, userId, ...rider }) => {
      const [renewal] = renewals;
      const job = busy.find((o) => o.riderId === userId);
      return {
        ...rider,
        deliveries: countOf(allTime, userId),
        deliveriesToday: countOf(today, userId),
        currentOrder: job ? { id: job.id, status: job.status, forThisStore: job.vendorId === store.id } : null,
        document: documentKind(licenseFile),
        renewal: renewal ? { id: renewal.id, number: renewal.number, expiresAt: renewal.expiresAt, submittedAt: renewal.submittedAt, document: documentKind(renewal.file) } : null,
      };
    }),
  });
});

vendorRidersRouter.post("/riders/:id/review", async (req, res) => {
  const input = parseBody(reviewSchema, req.body);
  await reviewRider(String(req.params.id), input, { vendorId: await myVendorId(req.session!.userId), actor: actorOf(req) });
  res.json({ ok: true });
});

vendorRidersRouter.post("/rider-renewals/:id/review", async (req, res) => {
  const input = parseBody(renewalReviewSchema, req.body);
  await reviewRenewal(String(req.params.id), input, { vendorId: await myVendorId(req.session!.userId), actor: actorOf(req) });
  res.json({ ok: true });
});

/** The rider stops working for this store and asks the admin to review them as a free rider. */
vendorRidersRouter.post("/riders/:id/remove", async (req, res) => {
  const id = String(req.params.id);
  const vendorId = await myVendorId(req.session!.userId);
  const rider = await prisma.riderProfile.findFirst({ where: { id, vendorId }, select: { userId: true, suspendedByAdmin: true, user: { select: { name: true } }, vendor: { select: { name: true } } } });
  if (!rider) throw new HttpError(404, "This rider isn't part of your store.");
  if (rider.suspendedByAdmin) throw new HttpError(403, "The Feasto admin suspended this rider, so only the admin can change this.");
  const busy = await prisma.order.count({ where: { riderId: rider.userId, status: { in: BUSY } } });
  if (busy > 0) throw new HttpError(409, "This rider is on a delivery. Try again when it's finished.");

  await prisma.$transaction(async (tx) => {
    await tx.riderProfile.update({
      where: { id },
      data: { vendorId: null, status: "PENDING", reviewNote: null, reviewedAt: null, isOnline: false },
    });
    await logActivity(tx, actorOf(req), { category: "APPROVALS", action: "Removed rider from store", target: rider.user.name, detail: rider.vendor?.name });
  });
  await forgetRiderPosition(rider.userId);
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
