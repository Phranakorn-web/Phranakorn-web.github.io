// =========================================================================
// --- WMS PWA SERVICE WORKER ENGINE (CACHE-FIRST OFFLINE v1.0.0) ---
// =========================================================================

const CACHE_NAME = 'wms-inbound-pwa-v1.0';
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './inbound-db.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://unpkg.com/html5-qrcode'
];

// 🟢 1. INSTALL EVENT: พรีแคชไฟล์จำเป็นสำหรับการทำงานแบบ Offline 100%
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// 🟢 2. ACTIVATE EVENT: เคลียร์แคชเวอร์ชันเก่าอัตโนมัติ
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 🟢 3. FETCH EVENT: Cache-First สำหรับ Static Assets & Network-Only สำหรับ Supabase API
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // ปล่อยผ่าน API Requests (Supabase / Database) ให้ใช้ระบบ Offline Queue ใน inbound-db.js จัดการ
    if (requestUrl.origin.includes('supabase') || requestUrl.pathname.includes('/rest/v1/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // คืนค่าจาก Cache ทันทีแม้อยู่กลางโกดังไร้สัญญาณ
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                return networkResponse;
            }).catch(() => {
                // Fallback กรณีโหลดหน้าหลักแบบออฟไลน์
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});