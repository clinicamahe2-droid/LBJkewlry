const CACHE_NAME = "lb-admin-v20261008a";
const PRECACHE_URLS = [
  "/admin",
  "/admin.html",
  "/admin.css?v=20261008a",
  "/admin.js?v=20261008a",
  "/admin-manifest.json?v=lb18k",
  "/assets/pwa/icon-192.png?v=lb18k",
  "/assets/pwa/icon-512.png?v=lb18k",
  "/assets/pwa/apple-touch-icon.png?v=lb18k"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isAdminAsset(url) {
  return (
    url.pathname === "/admin" ||
    url.pathname === "/admin.html" ||
    url.pathname === "/admin.css" ||
    url.pathname === "/admin.js" ||
    url.pathname === "/catalog.js" ||
    url.pathname === "/admin-manifest.json" ||
    url.pathname.startsWith("/assets/pwa/")
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (new URL(request.url).pathname === "/admin") {
      const fallback = await caches.match("/admin.html");
      if (fallback) return fallback;
    }
    throw new Error("offline");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;
  if (!isAdminAsset(url)) return;

  const isShell = url.pathname === "/admin" || url.pathname === "/admin.html";
  event.respondWith(isShell ? networkFirst(event.request) : staleWhileRevalidate(event.request));
});
