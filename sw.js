// Service Worker for Theo dõi HSBA BV HNĐK Nghệ An PWA
const CACHE_NAME = 'hsba-pwa-v5.0.4';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/data.js',
  '/js/modal.js',
  '/js/notificationService.js',
  '/js/storage.js',
  '/js/supabase.js',
  '/js/utils.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon.svg'
];

// Install Event: Cache new assets and activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Some precache assets failed to load:', err);
        });
      })
  );
});

// Activate Event: Delete old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Xóa cache phiên bản cũ:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for custom messages from client
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.action === 'skipWaiting')) {
    self.skipWaiting();
  }
  if (event.data && event.data.action === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(cacheNames.map((c) => caches.delete(c)));
    });
  }
});

// Fetch Event - Network First Strategy (Always fetch latest files from server when online)
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip external CDN / Supabase requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-First: Always try to get fresh copy from server first, fallback to cache if offline
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache when offline or network error
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
          return null;
        });
      })
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  let data = {
    title: 'Theo dõi HSBA - BV HNĐK Nghệ An',
    body: 'Có thông báo mới về hồ sơ bệnh án rà soát lỗi',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'hsba-notification',
    data: { url: '/' }
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    vibrate: [100, 50, 100, 50, 200],
    data: data.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Xem hồ sơ ➔' },
      { action: 'close', title: 'Đóng' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
