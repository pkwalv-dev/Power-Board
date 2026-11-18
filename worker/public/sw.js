// Power Board offline shell. Keeps the page itself loadable when the network is slow or down.
// It never caches or answers /api/* (scores must always come from the server).
// Bump V whenever index.html, the manifest, or the icon changes so old copies are dropped.
const V = 'pb-shell-v1';
// Not '/index.html': Cloudflare's static assets redirect it to '/', and redirected responses can't be cached for navigation.
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isApi = u => u.pathname === '/api' || u.pathname.startsWith('/api/');

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  // Not ours to handle: other origins, non-GET, and anything under /api. Returning without
  // respondWith lets the browser do a normal network request.
  if (u.origin !== self.location.origin || req.method !== 'GET' || isApi(u)) return;
  if (req.mode === 'navigate') { e.respondWith(page(req, u)); return; }
  if (SHELL.includes(u.pathname)) e.respondWith(caches.match(u.pathname).then(hit => hit || fetch(req)));
});

// Network first; if it takes longer than NAV_TIMEOUT_MS or fails, fall back to the cached page.
function page(req, u) {
  const net = fetch(req).then(res => {
    if (res.ok && res.type === 'basic' && !res.redirected && (u.pathname === '/' || u.pathname === '/index.html')) { const copy = res.clone(); caches.open(V).then(c => c.put('/', copy)); }
    return res;
  });
  const cached = () => caches.match('/');
  const timeout = new Promise(ok => setTimeout(ok, NAV_TIMEOUT_MS)).then(cached);
  return Promise.race([net.catch(cached), timeout])
    .then(res => res || net)            // timed out with nothing cached: keep waiting for the network
    .catch(() => cached())
    .then(res => res || Response.error());
}
