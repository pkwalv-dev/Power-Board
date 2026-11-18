// Power Board offline shell. Keeps the page itself loadable when the network is slow or down.
// It never caches or answers /api/* (scores must always come from the server).
// Bump V whenever index.html, the manifest, or the icon changes so old copies are dropped.
const V = 'pb-shell-v2';
// Not '/index.html': Cloudflare's static assets redirect it to '/', and redirected responses can't be cached for navigation.
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
const NAV_TIMEOUT_MS = 4000;

// Only our own page is ever kept. A web filter (WCPSS uses Zscaler) can answer "/" with its block or warning page
// at the same address and status 200; caching that would show the block page offline even after IT allows the site.
const MARK = '<!-- power-board-shell -->';
const isShell = res => res.ok && res.type === 'basic' && !res.redirected &&
  res.clone().text().then(t => t.includes(MARK)).catch(() => false);
async function keep(c, path, res) { if (await isShell(res)) await c.put(path, res); }

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(async c => {
    const page = await fetch('/', { cache: 'no-store' });
    if (!(await isShell(page))) throw new Error('not our page');   // install again on a later visit
    await c.put('/', page);
    await c.addAll(SHELL.slice(1));
  }).then(() => self.skipWaiting()));
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
    if (u.pathname === '/' || u.pathname === '/index.html') { const copy = res.clone(); caches.open(V).then(c => keep(c, '/', copy)); }
    return res;
  });
  const cached = () => caches.match('/');
  const timeout = new Promise(ok => setTimeout(ok, NAV_TIMEOUT_MS)).then(cached);
  return Promise.race([net.catch(cached), timeout])
    .then(res => res || net)            // timed out with nothing cached: keep waiting for the network
    .catch(() => cached())
    .then(res => res || Response.error());
}
