const CACHE_NAME = 'nextrack-v80'; // Incremented key version
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/student.html',
  '/style.css',
  '/js/data.js',
  '/js/auth.js',
  '/js/admin.js',
  '/js/student.js',
  '/js/pwa-v32.js'
];

// On install, cache vital assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// 🚀 NETWORK-FIRST STRATEGY (v80)
// This ensures users always get the latest bug fixes if online.
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests (Firebase doesn't like them in cache)
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        // If network works, update the cache
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkRes.clone());
          return networkRes;
        });
      })
      .catch(() => {
        // If network fails (Offline), try the cache
        return caches.match(event.request);
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
