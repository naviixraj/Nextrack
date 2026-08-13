const CACHE_NAME = 'nextrack-v125';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/student.html',
  '/css/style.css',
  '/irn.png',
  '/js/firebase-config.js',
  '/js/data.js',
  '/js/auth.js',
  '/js/admin.js',
  '/js/student.js',
  '/js/pwa-v32.js',
  '/icon-192.png',
  '/icon-512.png'
];

// Cache strategy for different types of requests
const NETWORK_FIRST_ASSETS = ['index.html', 'admin.html', 'student.html', 'js/firebase-config.js', 'js/data.js', 'js/auth.js', 'js/admin.js', 'js/student.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNetworkFirst = NETWORK_FIRST_ASSETS.some(asset => url.pathname.endsWith(asset));

  if (isNetworkFirst) {
    // Network First Strategy
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clon = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clon));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache First Strategy for static assets
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});
