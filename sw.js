const CACHE_NAME = "sandtris-v20260202-18";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCs669r3JZNH7vhnMtvHo_5TfQHIwYyHdM",
  authDomain: "sandtris-81990.firebaseapp.com",
  projectId: "sandtris-81990",
  messagingSenderId: "326035049350",
  appId: "1:326035049350:web:9ad14c51b0366dc8ccfa07",
};
const DEFAULT_NOTIFICATION = {
  title: "Sandtris",
  body: "Pronto per la partita di oggi?",
  icon: "assets/app-icon.png",
  badge: "assets/app-icon.png",
};
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=20260202-18",
  "./app.js?v=20260202-18",
  "./manifest.webmanifest?v=20260202-18",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/maskable-icon.png",
  "./assets/apple-touch-icon.png",
  "./assets/app-icon.png",
  "./assets/favicon.ico",
  "./assets/favicon-32.png",
  "./assets/crown.png",
];

let messaging = null;
try {
  importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");
  firebase.initializeApp(FIREBASE_CONFIG);
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || DEFAULT_NOTIFICATION.title;
    const options = {
      body: payload?.notification?.body || DEFAULT_NOTIFICATION.body,
      icon: payload?.notification?.icon || DEFAULT_NOTIFICATION.icon,
      badge: payload?.notification?.badge || DEFAULT_NOTIFICATION.badge,
      data: payload?.data || { url: "./" },
    };
    self.registration.showNotification(title, options);
  });
} catch {
  messaging = null;
}

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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url)) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
