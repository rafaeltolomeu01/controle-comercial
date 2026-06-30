self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title:'Controle de Campo', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Controle de Campo', { body: data.body || '', tag: data.record_id || data.module || 'controle-campo', data }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.target_hash) || '/';
  event.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(clients => {
    for (const client of clients) { if ('focus' in client) { client.navigate(hash); return client.focus(); } }
    return self.clients.openWindow(hash);
  }));
});
