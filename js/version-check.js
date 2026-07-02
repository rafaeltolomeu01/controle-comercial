/* Atualização automática do sistema após deploy. */
(function () {
  'use strict';
  const CURRENT_VERSION = '20260702-0845-importados-autofill-cache';
  const VERSION_KEY = 'controle_campo_app_version';
  window.__APP_VERSION__ = CURRENT_VERSION;

  async function clearAppCaches() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } catch (_) {}
  }

  async function checkVersion() {
    try {
      const res = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const remote = String(data.version || '').trim();
      if (!remote) return;
      const local = localStorage.getItem(VERSION_KEY);
      if (!local) {
        localStorage.setItem(VERSION_KEY, remote);
        return;
      }
      if (local !== remote) {
        localStorage.setItem(VERSION_KEY, remote);
        await clearAppCaches();
        window.location.reload();
      }
    } catch (_) {}
  }

  window.addEventListener('load', () => {
    localStorage.setItem(VERSION_KEY, localStorage.getItem(VERSION_KEY) || CURRENT_VERSION);
    checkVersion();
    setInterval(checkVersion, 45000);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => reg.update().catch(() => {}))).catch(() => {});
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'APP_UPDATED') checkVersion();
      });
    }
  });
})();
