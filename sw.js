/*
 * Coupon Studio offline cache.
 * Every file the app needs is cached on install, so the installed app opens and builds PDFs with no internet.
 * When online, requests go to the network first (so a new deploy shows up straight away) and refresh the cache;
 * when offline or the network is too slow, the cached copy answers. Bump VERSION when the list of files changes.
 */
const VERSION = 'v2';
const CACHE = 'coupon-studio-' + VERSION;
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'render.js', 'assets/fonts.js', 'lib/jspdf.umd.min.js',
  'manifest.webmanifest', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('coupon-studio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? './' : req;
    const network = fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    // Wait up to 4 s for the network, then fall back to the offline copy.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
    const fresh = await Promise.race([network, timeout]);
    if (fresh) return fresh;
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) { event.waitUntil(network); return cached; }
    return (await network) || Response.error();
  })());
});
