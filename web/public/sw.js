// Feasto service worker. It makes the app installable and shows a friendly page when the
// phone has no connection. Everything else goes straight to the network: orders, stock and
// live updates must always be fresh, so nothing else is cached.
const CACHE = "feasto-offline-v2";
const OFFLINE_PAGE = "/offline.html";
const OFFLINE_ICON = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_PAGE, OFFLINE_ICON])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_PAGE)));
  } else if (new URL(request.url).pathname === OFFLINE_ICON) {
    // The offline page's own picture: from the network when possible, else the saved copy
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_ICON)));
  }
});

// ---- Notifications while Feasto is closed (Web Push; sent by server/src/lib/push.ts) ----

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      // Feasto is open on screen: the page already shows it as a toast (except the test message)
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (!message.always && windows.some((w) => w.visibilityState === "visible")) return;
      await self.registration.showNotification(message.title || "Feasto", {
        body: message.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: message.tag,
        renotify: Boolean(message.tag),
        data: { link: message.link || "/" },
      });
    })(),
  );
});

// Tapping it opens the page it's about, in the Feasto window already open if there is one
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = new URL((event.notification.data && event.notification.data.link) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) return open.navigate(link).catch(() => self.clients.openWindow(link));
      }
      return self.clients.openWindow(link);
    })(),
  );
});
