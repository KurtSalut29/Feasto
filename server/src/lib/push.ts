import webpush from "web-push";
import { config } from "../config.js";
import { prisma } from "./db.js";

/**
 * Web Push: notifications that reach a phone or computer while Feasto is closed. Each browser that
 * turns them on gives Feasto an address at its push service (Google's for Chrome, Apple's for
 * iPhones, Mozilla's for Firefox). Feasto signs every message with its VAPID key, so the push
 * service knows it's really Feasto, and the browser's service worker (web/public/sw.js) shows it.
 *
 * Without VAPID keys in .env this does nothing, and notifications only show in the open app.
 */
export const pushEnabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);
if (pushEnabled) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

export type PushMessage = {
  title: string;
  body: string;
  /** The page to open when it's tapped */
  link?: string | null;
  /** Messages with the same tag replace each other (e.g. one per order's chat) */
  tag?: string;
};

/** Sends to every browser this person turned notifications on in. Never throws. */
export async function pushTo(userId: string, message: PushMessage) {
  if (!pushEnabled) return;
  try {
    const devices = await prisma.pushSubscription.findMany({ where: { userId, user: { disabledAt: null } } });
    await Promise.all(
      devices.map(async (device) => {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            JSON.stringify({ title: message.title, body: message.body, link: message.link ?? null, tag: message.tag }),
            // Kept an hour if the phone is off; "high" wakes a sleeping phone for it
            { TTL: 3600, urgency: "high", timeout: 5000 },
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // Gone: the person turned them off, cleared the browser or uninstalled the app
          if (status === 404 || status === 410) await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
          else console.warn(`[push] couldn't reach a device of ${userId}: ${status ?? (error as Error).message}`);
        }
      }),
    );
  } catch (error) {
    console.warn("[push] failed:", (error as Error).message);
  }
}
