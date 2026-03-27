// Minimal service worker — satisfies Chrome's PWA installability requirement.
// No caching; fetch handler is required by Chrome for the install prompt.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)))
