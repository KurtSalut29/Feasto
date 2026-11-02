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
