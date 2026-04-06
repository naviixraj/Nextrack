const CACHE_NAME = 'nextrack-v1';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
