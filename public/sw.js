const CACHE = 'pulsecord-shell-v1'
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.json', 'icon-192.png'])).catch(() => {})); self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))))
})
