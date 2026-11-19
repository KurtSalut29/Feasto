import { Router, type Request } from "express";
import { z } from "zod";
import type { IdCheck } from "../generated/prisma/client.js";
import { logActivity, type Actor } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { notify } from "../lib/liveUpdates.js";
import { documentKind } from "../lib/verification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * The admin checks each resident's valid ID: does the photo show a real ID, and does its name match
 * the one they signed up with? Verified locks the name; not accepted asks them for another photo.
 */
export const adminResidentIdsRouter = Router();
adminResidentIdsRouter.use(requireAuth, requireRole("ADMIN"));

const PAGE_SIZE = 20;
const STATUSES = ["PENDING", "VERIFIED", "REJECTED"] as const;
const actorOf = (req: Request): Actor => ({ userId: req.session!.userId, name: req.session!.name });

adminResidentIdsRouter.get("/resident-ids", async (req, res) => {
  const { status, page } = z.object({ status: z.enum(STATUSES).catch("PENDING"), page: z.coerce.number().int().min(1).catch(1) }).parse(req.query);
  const where = { role: "RESIDENT" as const, idStatus: status as IdCheck };
  const [rows, total, grouped, missing] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: status === "PENDING" ? { createdAt: "asc" } : { idReviewedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        firstName: true,
        middleName: true,
        lastName: true,
        suffix: true,
        email: true,
        phone: true,
        createdAt: true,
        idType: true,
        idFile: true,
        idStatus: true,
        idReviewNote: true,
        idReviewedAt: true,
        disabledAt: true,
      },
    }),
    prisma.user.count({ where }),
    prisma.user.groupBy({ by: ["idStatus"], where: { role: "RESIDENT", idStatus: { not: null } }, _count: true }),
    prisma.user.count({ where: { role: "RESIDENT", idStatus: null } }),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, grouped.find((g) => g.idStatus === s)?._count ?? 0]));
  res.json({
    status,
    page,
    pageSize: PAGE_SIZE,
    total,
    counts,
    notUploaded: missing,
    residents: rows.map(({ idFile, ...r }) => ({ ...r, document: documentKind(idFile) })),
  });
});

const reviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("VERIFIED") }),
  z.object({ decision: z.literal("REJECTED"), note: z.string().trim().min(5, "Say what's wrong, so they can fix it (at least 5 letters).").max(200) }),
]);

adminResidentIdsRouter.post("/resident-ids/:id/review", async (req, res) => {
  const id = String(req.params.id);
  const input = parseBody(reviewSchema, req.body);
  const note = input.decision === "REJECTED" ? input.note : null;
  const resident = await prisma.$transaction(async (tx) => {
    // Only an ID waiting for a check: two admins' clicks (or a double click) count once
    const { count } = await tx.user.updateMany({
      where: { id, role: "RESIDENT", idStatus: "PENDING" },
      data: { idStatus: input.decision, idReviewNote: note, idReviewedAt: new Date() },
    });
    if (count === 0) throw new HttpError(409, "This ID was already checked, or a new photo came in. Refresh to see the latest.");
    const user = await tx.user.findUniqueOrThrow({ where: { id }, select: { name: true } });
    await logActivity(tx, actorOf(req), {
      category: "APPROVALS",
      action: input.decision === "VERIFIED" ? "Verified a resident's ID" : "Didn't accept a resident's ID",
      target: user.name,
      detail: note,
    });
    return user;
  });
  await notify(
    id,
    input.decision === "VERIFIED"
      ? { title: "Your ID is verified", body: "Thanks! Your account is verified, so stores and riders know who they're serving.", link: "/resident/account" }
      : { title: "We couldn't verify your ID", body: `${note} Upload a clear photo of a valid ID with the same name as your account.`, link: "/resident" },
  );
  res.json({ ok: true, name: resident.name });
});
