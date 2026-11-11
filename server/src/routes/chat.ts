import { Router } from "express";
import { z } from "zod";
import type { Role } from "../generated/prisma/client.js";
import { prisma } from "../lib/db.js";
import { HttpError, parseBody } from "../lib/http.js";
import { CHANNELS, publish } from "../lib/liveUpdates.js";
import { orderCode } from "../lib/orders.js";
import { redis } from "../lib/redis.js";
import { requireAuth } from "../middleware/auth.js";

/**
 * One chat per order, shared by the resident, the store and the rider once one is assigned
 * ("Nasa gate na po ako", "Ubos na po ang chicken, okay lang pork?"). Messages are saved, then
 * pushed live to the others' open pages, the same way order updates travel. Sending is open while
 * the order runs and for a little while after; the thread stays readable afterwards.
 */
export const chatRouter = Router();
chatRouter.use(requireAuth);

/** How long after an order finishes its chat still takes messages */
const OPEN_AFTER_MINUTES = 30;
const MAX_LENGTH = 500;
/** Messages one person may send per minute, across every API copy */
const PER_MINUTE = 20;

type Part = Extract<Role, "RESIDENT" | "VENDOR" | "RIDER">;

const FINISHED = ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"];

async function chatOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      fulfillment: true,
      finishedAt: true,
      riderId: true,
      rider: { select: { id: true, name: true } },
      vendor: { select: { name: true, ownerId: true } },
      checkout: { select: { residentId: true, resident: { select: { name: true } } } },
    },
  });
  // Someone who isn't part of the order gets the same answer as for an order that doesn't exist
  const part: Part | null = !order
    ? null
    : order.checkout.residentId === userId
      ? "RESIDENT"
      : order.vendor.ownerId === userId
        ? "VENDOR"
        : order.riderId === userId
          ? "RIDER"
          : null;
  if (!order || !part) throw new HttpError(404, "This chat isn't available.");

  const finished = FINISHED.includes(order.status);
  const closedAt = finished && order.finishedAt ? new Date(order.finishedAt.getTime() + OPEN_AFTER_MINUTES * 60_000) : null;
  const open = !finished || (closedAt !== null && closedAt > new Date());
  // Who's in the chat, and where each one opens it
  const members = [
    { userId: order.checkout.residentId, part: "RESIDENT" as const, name: order.checkout.resident.name, link: `/resident/orders/${order.id}` },
    { userId: order.vendor.ownerId, part: "VENDOR" as const, name: order.vendor.name, link: `/vendor/orders/${order.id}` },
    ...(order.rider ? [{ userId: order.rider.id, part: "RIDER" as const, name: order.rider.name, link: "/rider/active" }] : []),
  ];
  return { order, part, open, members };
}

const shown = (m: { id: string; body: string; senderId: string; senderRole: Role; createdAt: Date; sender: { name: string } }, userId: string, storeName: string) => ({
  id: m.id,
  body: m.body,
  part: m.senderRole,
  // The store speaks as the store, not as the owner's own name
  name: m.senderRole === "VENDOR" ? storeName : m.sender.name,
  mine: m.senderId === userId,
  createdAt: m.createdAt.toISOString(),
});

// The thread, who's in it, whether it still takes messages, and how many are new to this person
chatRouter.get("/:orderId", async (req, res) => {
  const userId = req.session!.userId;
  const { order, part, open, members } = await chatOrder(String(req.params.orderId), userId);
  const [messages, read] = await Promise.all([
    prisma.orderMessage.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: { sender: { select: { name: true } } },
    }),
    prisma.orderChatRead.findUnique({ where: { orderId_userId: { orderId: order.id, userId } } }),
  ]);
  const unread = messages.filter((m) => m.senderId !== userId && (!read || m.createdAt > read.readAt)).length;
  res.json({
    you: part,
    open,
    rider: !!order.riderId,
    pickup: order.fulfillment === "PICKUP",
    members: members.map(({ part, name }) => ({ part, name })),
    unread,
    messages: messages.map((m) => shown(m, userId, order.vendor.name)),
  });
});

const messageSchema = z.object({ body: z.string().trim().min(1, "Write a message first.").max(MAX_LENGTH, `Keep it under ${MAX_LENGTH} characters.`) });

chatRouter.post("/:orderId", async (req, res) => {
  const userId = req.session!.userId;
  const { body } = parseBody(messageSchema, req.body);
  const { order, part, open, members } = await chatOrder(String(req.params.orderId), userId);
  if (!open) throw new HttpError(409, "This chat has closed: the order is finished.");

  const key = `chat-rate:${userId}`;
  const sent = await redis.incr(key);
  if (sent === 1) await redis.expire(key, 60);
  if (sent > PER_MINUTE) throw new HttpError(429, "You're sending messages too fast. Wait a moment.");

  const message = await prisma.orderMessage.create({
    data: { orderId: order.id, senderId: userId, senderRole: part, body },
    include: { sender: { select: { name: true } } },
  });
  // Writing in a chat means you've read it up to here
  await prisma.orderChatRead.upsert({
    where: { orderId_userId: { orderId: order.id, userId } },
    create: { orderId: order.id, userId, readAt: message.createdAt },
    update: { readAt: message.createdAt },
  });

  const code = orderCode(order.id);
  await Promise.all(
    members
      .filter((m) => m.userId !== userId)
      .map((m) =>
        publish(CHANNELS.user(m.userId), {
          type: "chat.message",
          orderId: order.id,
          code,
          link: m.link,
          message: shown(message, m.userId, order.vendor.name),
        }),
      ),
  );
  res.status(201).json({ message: shown(message, userId, order.vendor.name) });
});

// Marks the thread read up to now (the chat is open on screen)
chatRouter.post("/:orderId/read", async (req, res) => {
  const userId = req.session!.userId;
  const { order } = await chatOrder(String(req.params.orderId), userId);
  const now = new Date();
  await prisma.orderChatRead.upsert({
    where: { orderId_userId: { orderId: order.id, userId } },
    create: { orderId: order.id, userId, readAt: now },
    update: { readAt: now },
  });
  res.status(204).end();
});
