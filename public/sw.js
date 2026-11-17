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
  if (d.cancel) { // appel arrêté : remplace la notification par un message bref, puis la ferme
    e.waitUntil(self.registration.showNotification('Appel arrêté', { body: d.from + ' a arrêté l\'appel.', tag: 'appel', icon: 'icon-180.png' })
      .then(() => new Promise(r => setTimeout(r, 2500))).then(() => self.registration.getNotifications({ tag: 'appel' })).then(l => l.forEach(n => n.close())));
    return;
  }
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.forEach(c => c.postMessage({ from: d.from }))));
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: 'icon-180.png', vibrate: Array(10).fill([1000, 300]).flat(), requireInteraction: true, tag: 'appel', renotify: true, data: { from: d.from }, actions: [{ action: 'stop', title: '⏹ Arrêter' }],
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'stop') { // bouton Arrêter : coupe les rappels côté serveur
    return e.waitUntil(caches.open('sc-auth').then(c => c.match('/token')).then(r => r && r.text()).then(t => t && fetch('/api/ack', {
      method: 'POST', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify({ pseudo: e.notification.data && e.notification.data.from }),
    })));
  }
  e.waitUntil(clients.matchAll({ type: 'window' }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
