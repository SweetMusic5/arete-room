// The Arete Room at Lavender's service worker.
// App shell: served from cache so the app opens offline, refreshed in the background.
// Data (Supabase): always network (posts are POST requests and are never cached here);
// the app keeps its own last copy so it can show something offline.
// Phone alerts: shows the two kinds of alert (a new Weekly, a meetup time) and opens the app when tapped.
const VERSION = 'arete-v3';
const SHELL = [
  './', './index.html', './styles.css', './app.js', './config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))   // skip the browser's HTTP cache
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'arete-fonts').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // data calls go straight to the network
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('arete-fonts').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;         // anything else off-site: network only

  // The page, app.js and config.js: network first (so a new version or new keys work on the very
  // next open), falling back to the saved copy when offline. Only good responses are saved.
  const fresh = req.mode === 'navigate' || /\/(index\.html|app\.js|config\.js)$/.test(url.pathname);
  if (fresh) {
    const key = req.mode === 'navigate' ? './index.html' : req;
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {   // a navigate Request can't take options
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key, { ignoreSearch: true }))
    );
    return;
  }

  // other shell files (styles, icons): cache first, refreshed in the background
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

// ---- Phone alerts (Web Push) ----
// Every push shows a notification (iPhone requires it). The words come encrypted from the sender.
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data ? e.data.text() : '' }; }
  const title = m.title || 'The Arete Room';
  e.waitUntil(self.registration.showNotification(title, {
    body: m.body || 'Something new is waiting for you.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: m.tag || 'arete',
    data: { url: m.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        return c.focus().then((w) => (w && 'navigate' in w && target.includes('tab=') ? w.navigate(target) : w));
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});
