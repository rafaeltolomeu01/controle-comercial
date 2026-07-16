const CACHE_VERSION = '20260716-11-escopo-global-unidade';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      if (self.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      await self.clients.claim();
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'APP_UPDATED', version: CACHE_VERSION }));
    } catch (_) {}
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Uploads podem ser arquivos grandes. Mantém fluxo normal.
  if (url.pathname.startsWith('/api/uploads/') || url.pathname.startsWith('/uploads/')) return;
  event.respondWith(fetch(new Request(req, { cache: 'no-store' })).catch(() => fetch(req)));
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Controle de Campo', body: event.data && event.data.text() };
  }

  const title = data.title || 'Controle de Campo';
  const options = {
    body: data.body || '',
    tag: data.record_id || data.module || 'controle-campo',
    data,
    icon: '/icon.svg',
    badge: '/icon.svg',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetHash = (event.notification.data && event.notification.data.target_hash) || '#notificacoes';
  const targetUrl = targetHash.startsWith('#') ? `/${targetHash}` : targetHash;

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if ('focus' in client) {
        if ('navigate' in client) client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  }));
});
