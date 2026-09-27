/* Network-first shell so Brave/mobile pick up CSS/JS fixes quickly */
const CACHE_NAME = "tripdiary-v8";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/styles.css?v=8",
  "./js/main.js",
  "./js/main.js?v=8",
  "./js/data.js",
  "./js/render.js",
  "./js/swipe.js",
  "./js/storage.js",
  "./js/event-form.js",
  "./js/weather.js",
  "./js/ai.js",
  "./js/settings.js",
  "./js/regions.js",
  "./js/rates.js",
  "./js/fx-sheet.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations and app shell — avoids sticky broken CSS on mobile.
  const isNavigate = request.mode === "navigate";
  const isShell =
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/tripdiary");

  if (isNavigate || isShell) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
