const C = 'sc-v2';
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html']))); });
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
// réseau d'abord (toujours à jour), cache si hors connexion ; l'API n'est jamais en cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'Smart Chemical', body: 'Tu es appelé !' };
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.forEach(c => c.postMessage('ring'))));
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: 'icon-180.png', vibrate: Array(10).fill([1000, 300]).flat(), requireInteraction: true, tag: 'appel', renotify: true,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
