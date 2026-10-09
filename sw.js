/* HelloTodo 服务工作者：离线缓存（应用外壳），数据在 localStorage 里，天然离线可用
   注意：每次改动项目文件后发布，请把 CACHE 版本号 +1（如 hellotodo-v3），
   否则老访客会一直拿到旧缓存。 */
const CACHE = 'hellotodo-v2';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/util.js',
  './js/store.js',
  './js/anim.js',
  './js/calendar.js',
  './js/stats.js',
  './js/ui.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        /* 单个文件失败不拖垮整个安装（addAll 是全有或全无） */
        cache.addAll(ASSETS).catch(() =>
          Promise.all(ASSETS.map((a) => cache.add(a).catch(() => { })))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  /* 缓存优先 + 后台更新：先秒回缓存，同时静默拉取新版本放进缓存 */
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const sameOrigin = new URL(request.url).origin === self.location.origin;

    const fetchAndCache = fetch(request).then((res) => {
      if (res && res.ok && sameOrigin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
      }
      return res;
    });

    if (cached) {
      event.waitUntil(fetchAndCache.catch(() => { })); /* 后台更新，失败不影响 */
      return cached;
    }

    try {
      return await fetchAndCache;
    } catch (e) {
      /* 离线兜底：页面导航回退到缓存的应用外壳 */
      if (request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
