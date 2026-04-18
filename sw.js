// Service worker: cache shell for offline + stale-while-revalidate for assets.
const CACHE = 'tp-v1';
const SHELL = [
  '/', '/index.html', '/playbook.html', '/start.html',
  '/step-2-team.html', '/step-3-containment.html', '/step-4-root-cause.html',
  '/step-5-action-plan.html', '/step-6-governance.html', '/step-7-monitoring.html',
  '/step-8-effectiveness.html', '/summary.html',
  '/manifest.webmanifest', '/assets/icon.svg',
  '/assets/css/styles.css',
  '/assets/js/config.js', '/assets/js/core.js', '/assets/js/data.js',
  '/assets/js/ai.js', '/assets/js/export.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Never cache Supabase, Netlify functions, or Anthropic
  if (url.pathname.startsWith('/.netlify/') || /supabase\.co|anthropic|resend/.test(url.host)) return;
  if (req.method !== 'GET') return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res.ok && url.origin === self.location.origin) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
