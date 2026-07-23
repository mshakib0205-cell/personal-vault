// Force Cache Wiping Service Worker v10
const CACHE_NAME = 'sv-v10-gdrive';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch fresh network copies for full speed
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
