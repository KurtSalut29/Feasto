import { Router } from "express";
import { z } from "zod";
import { logActivity } from "../lib/activity.js";
import { prisma } from "../lib/db.js";
import { parseBody } from "../lib/http.js";
import { broadcastOrder, orderCode } from "../lib/orders.js";
import { ISSUE_LABEL, issueLimit, rejectIssue, resolveIssue } from "../lib/orderIssues.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

/** Admin › Orders › Problems: every problem reported, the ones sent to Feasto first */
export const adminIssuesRouter = Router();
adminIssuesRouter.use(requireAuth, requireRole("ADMIN"));

adminIssuesRouter.get("/", async (req, res) => {
  const status = z.enum(["OPEN", "RESOLVED", "REJECTED"]).catch("OPEN").parse(req.query.status);
  const issues = await prisma.orderIssue.findMany({
    where: { status },
    orderBy: [{ escalatedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
    include: {
      order: {
        select: {
          id: true,
          subtotal: true,
          vendor: { select: { name: true } },
          rider: { select: { name: true } },
          checkout: { select: { paymentMethod: true, resident: { select: { name: true } } } },
          items: { select: { id: true, name: true, quantity: true } },
        },
      },
    },
  });
  const counts = Object.fromEntries((await prisma.orderIssue.groupBy({ by: ["status"], _count: true })).map((g) => [g.status, g._count]));
  res.json({
    status,
    counts,
    issues: await Promise.all(
      issues.map(async (i) => ({
        id: i.id,
        orderId: i.orderId,
        code: orderCode(i.orderId),
        kind: i.kind,
        label: ISSUE_LABEL[i.kind],
        note: i.note,
        photoUrl: i.photoUrl,
        status: i.status,
        amount: Number(i.amount),
        paidBy: i.paidBy,
        given: i.given,
        answer: i.answer,
        escalatedAt: i.escalatedAt,
        createdAt: i.createdAt,
        store: i.order.vendor.name,
        rider: i.order.rider?.name ?? null,
        resident: i.order.checkout.resident.name,
        paymentMethod: i.order.checkout.paymentMethod,
        items: i.order.items.filter((x) => i.itemIds.includes(x.id)).map((x) => `${x.quantity}× ${x.name}`),
        limit: i.status === "OPEN" ? await issueLimit(i.orderId, i.itemIds) : null,
      })),
    ),
  });
});

const decideSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("REFUND"), amount: z.number("Enter how much.").positive("Enter how much."), paidBy: z.enum(["STORE", "FEASTO"], "Choose who pays."), answer: z.string().trim().max(300).optional().transform((v) => v || null) }),
  z.object({ decision: z.literal("REJECT"), answer: z.string("Say why.").trim().min(5, "Say why (at least 5 letters).").max(300) }),
]);

adminIssuesRouter.post("/:id/decide", async (req, res) => {
  const input = parseBody(decideSchema, req.body);
  const id = String(req.params.id);
  const issue = await prisma.orderIssue.findUniqueOrThrow({ where: { id }, select: { orderId: true } });
  if (input.decision === "REFUND") await resolveIssue(id, { amount: input.amount, paidBy: input.paidBy, answer: input.answer, by: req.session!.userId });
  else await rejectIssue(id, input.answer, req.session!.userId, true);
  await prisma.$transaction((tx) =>
    logActivity(tx, { userId: req.session!.userId, name: req.session!.name }, {
      category: "ORDERS",
      action: input.decision === "REFUND" ? "Gave back for a problem" : "Turned down a problem",
      target: orderCode(issue.orderId),
      detail: input.decision === "REFUND" ? `₱${input.amount.toFixed(2)}, paid by ${input.paidBy === "STORE" ? "the store" : "Feasto"}` : input.answer,
    }),
  );
  await broadcastOrder(issue.orderId);
  res.json({ ok: true });
});
