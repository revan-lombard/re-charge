// Re-Charge panel service worker: shows phone/browser alerts (Web Push) and opens
// the right page when one is tapped. Alerts are sent by the notify-push /
// project-intake / quote / yoco-webhook functions. Nothing is cached here.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let a = {};
  try { a = e.data ? e.data.json() : {}; } catch (err) { a = { title: 'Re-Charge', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(a.title || 'Re-Charge', {
    body: a.body || '',
    icon: '/assets/icon-192.png',
    badge: '/assets/favicon-32.png',
    tag: a.tag || undefined,
    renotify: Boolean(a.tag),
    data: { url: a.url || '/admin/#/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/admin/#/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const panel = wins.find((w) => new URL(w.url).pathname.startsWith('/admin/'));
    if (panel) { await panel.focus(); try { await panel.navigate(url); } catch (err) { panel.postMessage({ go: url }); } return; }
    await self.clients.openWindow(url);
  })());
});
