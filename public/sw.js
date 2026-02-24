const CACHE_NAME = 'workout-planner-v11';
const ASSETS = [
    '/',
    '/index.html',
    '/exercises.html',
    '/style.css',
    '/app.js',
    '/exercises.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    // Skip waiting to activate immediately
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    // Clean up old caches
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // Take control immediately
    return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for http/https URLs
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

    // Network first for everything - always get fresh content
    // Only fall back to cache if offline
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Update cache with fresh content
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Offline: fall back to cache
                return caches.match(event.request);
            })
    );
});
