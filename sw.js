const CACHE_NAME = "sandtris-v20260201-16";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=20260201-16",
  "./app.js?v=20260201-16",
  "./manifest.webmanifest?v=20260201-16",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/maskable-icon.png",
  "./assets/apple-touch-icon.png",
  "./assets/app-icon.png",
  "./assets/favicon.ico",
  "./assets/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
