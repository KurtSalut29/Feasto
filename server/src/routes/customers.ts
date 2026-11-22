import { Router, type Request } from "express";
import { z } from "zod";
import { customerList, giveVoucher } from "../lib/customers.js";
import { prisma } from "../lib/db.js";
import { parseBody } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { myVendorId } from "./vendor.js";

/** Store › Customers and Admin › Customers: the list with its numbers, and giving picked customers a voucher */

const listQuery = (req: Request) => ({
  /** "2026-11"; this month when it's missing */
  month: z.string().max(7).nullish().catch(null).parse(req.query.month) ?? null,
  segment: z.enum(["all", "regulars", "new", "lapsing"]).catch("all").parse(req.query.segment),
  sort: z.enum(["orders", "spent", "last"]).catch("orders").parse(req.query.sort),
  q: z.string().trim().max(60).catch("").parse(req.query.q ?? ""),
  page: z.coerce.number().int().min(1).max(1000).catch(1).parse(req.query.page),
});

const giveSchema = z
  .object({
    userIds: z.array(z.string().min(1)).min(1, "Pick at least one customer.").max(200, "200 customers at most at a time."),
    title: z.string("Give it a name the customer will see.").trim().min(3, "Give it a name the customer will see, like Salamat, suki!").max(60, "60 characters at most."),
    benefit: z.enum(["PERCENT_OFF", "AMOUNT_OFF", "FREE_DELIVERY", "DELIVERY_OFF"], "Choose what it takes off."),
    value: z.number("Enter how much it takes off.").min(0).max(5000, "₱5,000 at most."),
    maxDiscount: z.number().positive("Enter more than ₱0.").max(5000).nullish().transform((v) => v ?? null),
    minSpend: z.number().min(0).max(100000).optional().default(0),
    days: z.number("Choose how long it lasts.").int().min(1, "At least a day.").max(60, "60 days at most."),
    message: z.string().trim().max(120).optional().transform((v) => v || null),
  })
  .refine((v) => v.benefit !== "PERCENT_OFF" || v.value <= 100, { path: ["value"], message: "Enter 1 to 100%." });

const actor = (req: Request) => ({ userId: req.session!.userId, name: req.session!.name });

export const vendorCustomersRouter = Router();
vendorCustomersRouter.use(requireAuth, requireRole("VENDOR"));

vendorCustomersRouter.get("/", async (req, res) => {
  res.json(await customerList(await myVendorId(req.session!.userId), listQuery(req)));
});

vendorCustomersRouter.post("/vouchers", async (req, res) => {
  const input = parseBody(giveSchema, req.body);
  const vendorId = await myVendorId(req.session!.userId);
  const vendor = await prisma.vendor.findUniqueOrThrow({ where: { id: vendorId }, select: { id: true, name: true } });
  res.status(201).json(await giveVoucher(actor(req), vendor, input));
});

export const adminCustomersRouter = Router();
adminCustomersRouter.use(requireAuth, requireRole("ADMIN"));

adminCustomersRouter.get("/", async (req, res) => {
  res.json(await customerList(null, listQuery(req)));
});

adminCustomersRouter.post("/vouchers", async (req, res) => {
  const input = parseBody(giveSchema, req.body);
  res.status(201).json(await giveVoucher(actor(req), null, input));
});
