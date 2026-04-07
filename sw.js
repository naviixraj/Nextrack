const CACHE_NAME = 'nextrack-v3';
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
  '/js/pwa.js',
  '/icon-192.png',
  '/icon-512.png'
];

// Force immediate update when a new service worker is found
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Clean up old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
