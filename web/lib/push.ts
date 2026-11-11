/**
 * Notifications that reach this phone or computer while Feasto is closed (Web Push). The
 * browser's push service gives Feasto an address for this browser; the server sends to it and
 * the service worker (public/sw.js) shows the message.
 *
 * iPhones only allow it for Feasto added to the Home Screen and opened from there.
 */

export type PushState =
  /** This browser can't (an old browser, or not HTTPS) */
  | "unsupported"
  /** An iPhone or iPad with Feasto in Safari: it has to be added to the Home Screen first */
  | "install-first"
  /** The person said no; only the browser's site settings can undo it */
  | "blocked"
  | "off"
  | "on";

const iOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(() => navigator.serviceWorker.ready);
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !window.isSecureContext || !("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window) || !("Notification" in window)) return iOS() && !installed() ? "install-first" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const subscription = await (await registration()).pushManager.getSubscription();
  return subscription ? "on" : "off";
}

/** The server's VAPID key as the bytes the browser wants */
function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function send(subscription: PushSubscription) {
  const response = await fetch("/api/me/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Couldn't turn on notifications. Try again.");
}

/** Asks for permission (must follow a tap) and signs this browser up. Returns the new state. */
export async function turnOnPush(): Promise<PushState> {
  const { enabled, publicKey } = (await (await fetch("/api/me/push", { cache: "no-store" })).json()) as { enabled: boolean; publicKey: string | null };
  if (!enabled || !publicKey) throw new Error("Notifications on your phone aren't set up on this server yet.");
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  // Made with another key (the server's keys changed): start again
  const key = keyBytes(publicKey);
  const current = subscription?.options.applicationServerKey;
  if (subscription && current && !sameBytes(new Uint8Array(current), key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await send(subscription);
  return "on";
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Stops them for this browser. */
export async function turnOffPush() {
  const subscription = await (await registration()).pushManager.getSubscription();
  if (!subscription) return;
  await fetch("/api/me/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => {});
  await subscription.unsubscribe();
}

/** Before logging out: the server stops sending this account's notifications to this browser. */
export async function forgetPushForLogout() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription)
      await fetch("/api/me/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
  } catch {
    // Logging out still works
  }
}

/** Ties this browser's notifications to whoever is signed in now (another account may have used it). */
export async function resyncPush() {
  if ((await pushState()) !== "on") return;
  const subscription = await (await registration()).pushManager.getSubscription();
  if (subscription) await send(subscription).catch(() => {});
}
