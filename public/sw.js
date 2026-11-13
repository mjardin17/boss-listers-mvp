// Boss Listers service worker.
// - Pages: network first (never serve a stale app after an update), cached copy only when offline.
// - /_next/static files with a content hash in their name, and icons: cache first. A hashed
//   file never changes under the same name, so a cached copy is always right.
// - /_next/static files WITHOUT a hash (the development server's webpack.js, main.js, page
//   files, manifests and hot updates) are never cached. They are rewritten under the same name
//   on every change; caching them once made the app reload itself forever on stale code.
// - /api/* and anything that is not a GET: always straight to the network.
const CACHE_NAME = "boss-listers-v3"; // v3: drops the v2 cache, which held stale development files
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

// True only for build output that carries a content hash, e.g. webpack-4e7214a60fad8e88.js.
function isImmutableAsset(pathname) {
  if (!pathname.startsWith("/_next/static/")) return false;
  if (pathname.startsWith("/_next/static/development/") || pathname.startsWith("/_next/static/webpack/")) return false;
  if (pathname.includes(".hot-update.")) return false;
  const file = pathname.slice(pathname.lastIndexOf("/") + 1);
  return /(^|[-.])[0-9a-f]{8,}\.[a-z0-9]+$/i.test(file);
}

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

  if (isImmutableAsset(url.pathname) || /^\/(icon-|apple-touch-icon|favicon)/.test(url.pathname)) {
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
