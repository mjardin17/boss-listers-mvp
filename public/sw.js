// Boss Listers service worker.
// - Pages: network first (never serve a stale app after an update), cached copy only when offline.
// - /_next/static and icons: cache first (hashed / immutable).
// - /api/* and anything that is not a GET: always straight to the network.
const CACHE_NAME = "boss-listers-v2";
const URLS_TO_CACHE = ["/login", "/manifest.json", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(URLS_TO_CACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/login")))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /^\/(icon-|apple-touch-icon|favicon)/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            putInCache(request, response);
            return response;
          })
      )
    );
  }
});
