/* Libreta de Hierro · service worker
   Primero intenta la red (para recibir cambios al momento) y, sin conexión,
   usa la copia guardada. Tus datos no pasan por aquí: están en IndexedDB. */
const VERSION = 'v1';
const CACHE = 'libreta-hierro-' + VERSION;
const SHELL = ['./', './index.html', './web-bridge.js', './web-extras.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('libreta-hierro-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const externo = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/.test(url.host);
  if (!propio && !externo) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (externo) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res;
    }
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true }) || await cache.match('./index.html');
      if (hit) return hit;
      throw err;
    }
  })());
});
