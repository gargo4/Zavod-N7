/* Factory No. 7 — сервис-воркер: игра запускается без интернета.
   Все пути относительные, поэтому работает и в корне домена, и в подпапке (например, на GitHub Pages: user.github.io/repo/).
   При выкладке новой версии игры поменяйте VERSION, чтобы телефон сбросил старый кэш. */
const VERSION = 'factory7-v1';
const BASE = new URL('./', self.registration.scope).href;
const SHELL = ['', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].map(p => BASE + p);
// three.js грузится из CDN (r128) — кладём в кэш заранее, иначе офлайн игра не стартует
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    await Promise.all(CDN.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => cache.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin === location.origin && url.pathname.endsWith('/sw.js')) return;

  // сама игра (~6 МБ): сначала сеть, но не дольше 4 секунд; не успела — берём из кэша, а загрузка доезжает в фоне для следующего запуска
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req).then(res => { if (res && res.ok) cache.put(BASE + 'index.html', res.clone()).catch(() => {}); return res; });
      const cached = () => cache.match(BASE + 'index.html').then(r => r || cache.match(BASE));
      try {
        return await Promise.race([net, new Promise((_, rej) => setTimeout(rej, 4000))]);
      } catch (e) {
        const c = await cached();
        if (c) { net.catch(() => {}); return c; }
        return net;
      }
    })());
    return;
  }

  // three.js, шрифты и прочее: из кэша сразу, в фоне обновляем
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => cached);
    return cached || net;
  })());
});
