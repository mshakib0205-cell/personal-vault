// Study Vault Service Worker
const CACHE_VERSION = 'sv-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const FILE_CACHE = `${CACHE_VERSION}-files`;

const APP_SHELL_URLS = [
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/css/main.css',
  '/css/auth.css',
  '/css/app.css',
  '/js/mega.js',
  '/js/storage.js',
  '/js/upload.js',
  '/js/preview.js',
  '/js/search.js',
  '/js/ui.js',
  '/js/cache.js',
  '/js/sw-register.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL_URLS).catch((err) => {
        console.warn('[SW] Some shell files failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('sv-') && key !== APP_SHELL_CACHE && key !== FILE_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls (MEGA API)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('mega.co.nz') || url.hostname.includes('mega.nz')) return;
  if (url.hostname.includes('unpkg.com')) return;

  // App shell: cache-first
  if (APP_SHELL_URLS.some((u) => url.pathname === u || url.pathname.endsWith(u.split('/').pop()))) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Cached files (recently opened): cache-first
  if (url.pathname.includes('/blob/') || request.headers.get('X-Cache-File')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Default: network-first with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Background sync for upload queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-queue') {
    event.waitUntil(processUploadQueue());
  }
});

async function processUploadQueue() {
  // Notify clients to process the upload queue
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'PROCESS_UPLOAD_QUEUE' });
  });
}

// Push message from app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_FILE') {
    const { url, name } = event.data;
    caches.open(FILE_CACHE).then((cache) => {
      fetch(url).then((res) => {
        if (res.ok) cache.put(new Request(url, { headers: { 'X-File-Name': name } }), res);
      });
    });
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
