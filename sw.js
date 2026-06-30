self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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
