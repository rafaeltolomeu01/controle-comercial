const CACHE_NAME = 'controle-campo-auth-fix-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Sempre buscar da rede para não entregar JS/HTML antigo com falha de login.
  event.respondWith(fetch(event.request));
});
