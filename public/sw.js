// Minimal service worker — satisfies Chrome's PWA installability requirement.
// No caching strategy; the app is not intended for offline use.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
