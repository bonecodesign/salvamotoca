// Static shell only. Never use Cache Storage for user-specific responses.
const CACHE = 'salva-motoca-static-f7-v1';
const ASSETS = ['./', './index.html', './config.js', './app.js', './bootstrap.js', './request-f1.js', './f2-flow.js', './f3-tow.js', './f4-finance.js', './live-app-current.js', './styles.css', './manifest.webmanifest', './assets/icon-192.png', './assets/icon.svg'];
const STATIC_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    // Only the explicitly enumerated public shell, with no credentials.
    const entries = await Promise.all([...STATIC_URLS].map(async url => {
      const response = await fetch(url, {credentials: 'omit', cache: 'reload', redirect: 'error'});
      if (!response.ok || response.redirected || response.type === 'opaque' ||
          /(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get('Cache-Control') || '')) {
        throw new Error('Static shell unavailable');
      }
      return [url, response];
    }));
    await Promise.all(entries.map(([url, response]) => cache.put(url, response)));
    await self.skipWaiting();
  } catch (error) {
    await caches.delete(CACHE);
    throw error;
  }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Remove earlier app caches, including entries cached by the old broad rule.
  await Promise.all((await caches.keys()).filter(key => key.startsWith('salva-motoca-') && key !== CACHE).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request;
  // Exact URL match: no query strings, API paths, cross-origin requests,
  // mutations or requests explicitly carrying Authorization / Range.
  if (request.method !== 'GET' || !STATIC_URLS.has(request.url) ||
      request.headers.has('Authorization') || request.headers.has('Range') ||
      request.cache === 'no-store') return;
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      // No runtime cache writes: only a known public asset can be recovered.
      const cached = await (await caches.open(CACHE)).match(request.url);
      return cached || new Response('Recurso de demonstração indisponível sem conexão.', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}
      });
    }
  })());
});
