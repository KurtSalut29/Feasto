import { prisma } from "./db.js";
import { marshal } from "./marshalling.js";
import { pushTo } from "./push.js";
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
  /** The admin's pages reload whenever any order changes */
  admin: "rt:admin",
};

export type RealtimeEvent =
  | { type: "notification"; notification: { id: string; title: string; body: string; link: string | null; createdAt: string } }
  | { type: "order.updated"; orderId: string; status: string }
  | { type: "jobs.changed" }
  | { type: "rider.location"; orderId: string; lat: number; lng: number; at: string }
  | { type: "booking.updated"; bookingId: string; status: string }
  | { type: "report.ready"; reportId: string }
  /** A new message in an order's chat; `link` is where this person opens that chat */
  | {
      type: "chat.message";
      orderId: string;
      code: string;
      link: string;
      message: { id: string; body: string; part: string; name: string; mine: boolean; createdAt: string };
    }
  /** The account was disabled: open pages should log out */
  | { type: "session.ended" };

export function publish(channel: string, event: RealtimeEvent) {
  return redis.publish(channel, marshal(event, { transport: "pubsub", channel }));
}

/**
 * Saves an in-app notification, pushes it live to the user's open pages, and sends it to the
 * phones and computers where they turned on notifications (shown there only while Feasto isn't
 * on screen).
 */
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
  // Not awaited: the push services can take a moment, and nothing waits for them
  void pushTo(userId, { title: notification.title, body: notification.body, link: notification.link, tag: `n-${notification.id}` });
}
