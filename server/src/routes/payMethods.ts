import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/**
 * A resident's own GCash, Maya and cards, shown on the checkout's payment card instead of a sample.
 * A card is kept the way a receipt shows it: brand, last 4 digits, expiry and name. The full number
 * and the CVV never reach Feasto: the browser keeps only the last 4, and paying still happens on
 * Xendit's secure page.
 */
export const payMethodsRouter = Router();
payMethodsRouter.use(requireAuth, requireRole("RESIDENT"));

const MAX_METHODS = 6;
const name = z
  .string()
  .trim()
  .min(2, "Enter the name on the account or card.")
  .max(60, "Use at most 60 characters.")
  .regex(/^[\p{L} .'-]+$/u, "Use letters, spaces and . ' - only.");

const methodSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["GCASH", "MAYA"]),
    holderName: name,
    number: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^09\d{9}$/, "Enter the 11-digit mobile number, like 09171234567.")),
  }),
  z
    .object({
      kind: z.literal("CARD"),
      holderName: name.transform((v) => v.toUpperCase()),
      brand: z.enum(["VISA", "MASTERCARD", "JCB", "AMEX"], "We take Visa, Mastercard, JCB and American Express."),
      last4: z.string().regex(/^\d{4}$/, "Enter the card number."),
      expMonth: z.number().int().min(1, "Enter the month, 01 to 12.").max(12, "Enter the month, 01 to 12."),
      expYear: z.number().int().min(2000).max(2100),
    })
    .refine((v) => new Date(v.expYear, v.expMonth, 1) > new Date(), { path: ["expiry"], message: "This card has expired." }),
]);

const view = (m: { id: string; kind: string; holderName: string; number: string | null; brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null }) => ({
  id: m.id,
  kind: m.kind,
  holderName: m.holderName,
  number: m.number,
  brand: m.brand,
  last4: m.last4,
  expMonth: m.expMonth,
  expYear: m.expYear,
});

payMethodsRouter.get("/", async (req, res) => {
  const methods = await prisma.savedPayMethod.findMany({ where: { userId: req.session!.userId }, orderBy: { createdAt: "asc" } });
  res.json({ methods: methods.map(view) });
});

payMethodsRouter.post("/", async (req, res) => {
  const input = parseBody(methodSchema, req.body);
  const userId = req.session!.userId;
  if ((await prisma.savedPayMethod.count({ where: { userId } })) >= MAX_METHODS) throw new HttpError(409, `You can save up to ${MAX_METHODS}. Remove one first.`);
  const duplicate = await prisma.savedPayMethod.findFirst({
    where: input.kind === "CARD" ? { userId, kind: "CARD", brand: input.brand, last4: input.last4 } : { userId, kind: input.kind, number: input.number },
  });
  if (duplicate) throw new HttpError(409, "That one is already saved.");
  const created = await prisma.savedPayMethod.create({ data: { userId, ...input } });
  res.status(201).json({ method: view(created) });
});

payMethodsRouter.delete("/:id", async (req, res) => {
  const { count } = await prisma.savedPayMethod.deleteMany({ where: { id: String(req.params.id), userId: req.session!.userId } });
  if (count === 0) throw new HttpError(404, "We couldn't find it. It may have been removed already.");
  res.json({ ok: true });
});
