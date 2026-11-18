import { Router, type Request } from "express";
import { z } from "zod";
import { logActivity, type Actor } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * The admin's list of Pabili places: shops that aren't on Feasto (the market, drugstores,
 * hardware) pinned once by someone who knows the town, so residents pick them instead of
 * dropping a pin themselves. Also suggests shops residents keep typing in, to add to the list.
 */
export const adminPabiliPlacesRouter = Router();
adminPabiliPlacesRouter.use(requireAuth, requireRole("ADMIN"));

const actorOf = (req: Request): Actor => ({ userId: req.session!.userId, name: req.session!.name });

const placeSchema = z.object({
  name: z.string().trim().min(2, "Enter the shop's name.").max(80),
  kind: z.enum(["MARKET", "PHARMACY", "GROCERY", "HARDWARE", "SARI_SARI", "OTHER"], "Choose what kind of shop it is."),
  address: z.string().trim().min(3, "Say where it is, like the street or a landmark.").max(200),
  latitude: z.number("Set the shop's pin on the map.").min(-90).max(90),
  longitude: z.number("Set the shop's pin on the map.").min(-180).max(180),
  isActive: z.boolean().optional(),
});

/** How far back to look for shops residents typed in themselves */
const SUGGEST_DAYS = 60;

adminPabiliPlacesRouter.get("/pabili-places", async (_req, res) => {
  const since = new Date(Date.now() - SUGGEST_DAYS * 86_400_000);
  const [places, typed] = await Promise.all([
    prisma.pabiliPlace.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { errands: true } } } }),
    // Bought Pabili from shops that aren't listed, newest first: after the rider's GPS check, their pin is where the rider bought
    prisma.errand.findMany({
      where: { placeId: null, boughtAt: { gte: since } },
      orderBy: { boughtAt: "desc" },
      select: { shopName: true, shopAddress: true, shopLat: true, shopLng: true, shopMovedKm: true },
      take: 500,
    }),
  ]);
  const listed = new Set(places.map((p) => p.name.trim().toLowerCase()));
  const byName = new Map<string, { name: string; address: string; latitude: number; longitude: number; times: number; corrected: number }>();
  for (const e of typed) {
    const key = e.shopName.trim().toLowerCase();
    if (listed.has(key)) continue;
    const seen = byName.get(key);
    if (seen) {
      seen.times += 1;
      if (e.shopMovedKm !== null) seen.corrected += 1;
    } else {
      byName.set(key, { name: e.shopName.trim(), address: e.shopAddress, latitude: e.shopLat, longitude: e.shopLng, times: 1, corrected: e.shopMovedKm !== null ? 1 : 0 });
    }
  }
  res.json({
    places: places.map(({ _count, ...p }) => ({ ...p, errands: _count.errands })),
    suggestions: [...byName.values()].sort((a, b) => b.times - a.times).slice(0, 10),
    suggestDays: SUGGEST_DAYS,
  });
});

adminPabiliPlacesRouter.post("/pabili-places", async (req, res) => {
  const input = parseBody(placeSchema, req.body);
  const place = await prisma.$transaction(async (tx) => {
    const created = await tx.pabiliPlace.create({ data: input });
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action: "Added a Pabili place", target: created.name, detail: created.address });
    return created;
  });
  res.status(201).json({ place });
});

adminPabiliPlacesRouter.patch("/pabili-places/:id", async (req, res) => {
  const id = String(req.params.id);
  const input = parseBody(placeSchema.partial(), req.body);
  const before = await prisma.pabiliPlace.findUnique({ where: { id } });
  if (!before) throw new HttpError(404, "We couldn't find this place.");
  const place = await prisma.$transaction(async (tx) => {
    const updated = await tx.pabiliPlace.update({ where: { id }, data: input });
    const action =
      input.isActive === false ? "Hid a Pabili place" : input.isActive === true && !before.isActive ? "Showed a Pabili place again" : "Edited a Pabili place";
    await logActivity(tx, actorOf(req), { category: "SETTINGS", action, target: updated.name });
    return updated;
  });
  res.json({ place });
});
