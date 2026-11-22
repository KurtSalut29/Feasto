import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { parseBody } from "../lib/http.js";
import { everifyOn, recordPhilsysQr } from "../lib/philsys.js";
import { perAccount } from "../lib/rateLimit.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** A resident's ID: its check status, and the PhilSys QR (Level 2) */
export const philsysRouter = Router();
philsysRouter.use(requireAuth, requireRole("RESIDENT"));

philsysRouter.get("/", async (req, res) => {
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: req.session!.userId },
    select: { idType: true, idStatus: true, idReviewNote: true, philsysQrAt: true, philsysMatch: true, philsysVerifiedAt: true },
  });
  res.json({ ...me, everify: everifyOn() });
});

philsysRouter.post("/qr", perAccount("philsys-qr", 10, 3600, "You've scanned a lot of QR codes just now. Try again later."), async (req, res) => {
  const { text } = parseBody(z.object({ text: z.string("Scan the QR first.").trim().min(10, "Scan the QR first.").max(5000) }), req.body);
  res.json({ match: await recordPhilsysQr(req.session!.userId, text) });
});
