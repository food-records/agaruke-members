// GitHub Pages replaces this value with the release commit SHA.
const CACHE_NAME = 'agaruke-vliff-shop-entry-20261101';
const ASSETS = [
    '/', '/index.html', '/index.css', '/liff.js', '/index.js', '/config.js',
    '/foodrecords_logo.png', '/images/agaruke_icon.svg', '/images/agaruke_icon.png',
    '/images/ticket-a.png', '/images/ticket-b.png', '/images/ticket-c.png', '/images/ticket-d.png',
];
const CORE = ['/', '/index.html', '/index.css', '/liff.js', '/index.js', '/config.js'];

self.addEventListener('install', event => {
    // A new cache name alone can seed old HTTP/CDN-cached scripts into the new
    // release. Fetch versioned URLs, then store under the normal asset keys.
    event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(ASSETS.map(async path => {
        const url = new URL(path, self.location.origin);
        url.searchParams.set('__release', CACHE_NAME);
        const response = await fetch(new Request(url.href, {cache: 'reload'}));
        if (!response.ok) throw new Error('Asset unavailable');
        await cache.put(path, response);
    }))));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    // API/LINE requests and writes never enter the static cache.
    if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
    if (CORE.includes(url.pathname) || event.request.mode === 'navigate') {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            try {
                const response = await fetch(new Request(event.request, {cache: 'no-cache'}));
                // Do not retain OAuth codes, serials or other query parameters.
                if (response.ok && !url.search) await cache.put(event.request, response.clone());
                return response;
            } catch (_) {
                return await cache.match(url.pathname) || new Response('オフラインです。接続後に再読み込みしてください。', {status: 503});
            }
        })());
        return;
    }
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && !url.search) await cache.put(event.request, response.clone());
        return response;
    }));
});
