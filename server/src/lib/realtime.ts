import { prisma } from "./db.js";
import { redis } from "./redis.js";

/**
 * Real-time messages travel over Redis pub/sub. A browser keeps one live connection
 * (Server-Sent Events) to whichever API copy Nginx gave it. When the worker or another
 * API copy publishes to a user's channel, every API copy receives it, and the copy that
 * holds that user's connection forwards it. So it works no matter which copy you're on.
 */
export const CHANNELS = {
  user: (userId: string) => `rt:user:${userId}`,
  /** Every online, approved rider listens here for new delivery jobs */
  riders: "rt:riders",
};

export type RealtimeEvent =
  | { type: "notification"; notification: { id: string; title: string; body: string; link: string | null; createdAt: string } }
  | { type: "order.updated"; orderId: string; status: string }
  | { type: "jobs.changed" }
  | { type: "rider.location"; orderId: string; lat: number; lng: number; at: string }
  | { type: "booking.updated"; bookingId: string; status: string }
  | { type: "report.ready"; reportId: string };

export function publish(channel: string, event: RealtimeEvent) {
  return redis.publish(channel, JSON.stringify(event));
}

/** Saves an in-app notification and pushes it live to the user's open pages. */
export async function notify(userId: string, message: { title: string; body: string; link?: string }) {
  const notification = await prisma.notification.create({
    data: { userId, title: message.title, body: message.body, link: message.link ?? null },
  });
  await publish(CHANNELS.user(userId), {
    type: "notification",
    notification: {
      id: notification.id,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      createdAt: notification.createdAt.toISOString(),
    },
  });
}
