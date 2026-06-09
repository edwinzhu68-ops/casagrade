/// <reference lib="webworker" />

const CACHE_NAME = 'lottery-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ------------------------------------------
// 安装事件 - 缓存静态资源
// ------------------------------------------
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

// ------------------------------------------
// 激活事件 - 清理旧缓存
// ------------------------------------------
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

// ------------------------------------------
// 请求拦截 - 网络优先，失败时用缓存
// ------------------------------------------
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // API请求 - 只用网络
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'offline', message: '网络不可用' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // 静态资源 - 缓存优先
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request);
      })
    );
    return;
  }

  // 页面导航 - 网络优先
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 克隆响应并缓存
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
          return response;
        })
        .catch(() => {
          // 离线时返回缓存的首页
          return caches.match('/') || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // 其他请求 - 网络优先
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ------------------------------------------
// 后台同步 (可选)
// ------------------------------------------
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
});

async function syncPendingOrders() {
  // 实现订单同步逻辑
  console.log('[SW] Syncing pending orders...');
}

// ------------------------------------------
// 推送通知 (可选)
// ------------------------------------------
self.addEventListener('push', (event: PushEvent) => {
  const data = event.data?.json() ?? {};
  
  const options: NotificationOptions = {
    body: data.body || '您有新的消息',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).registration.showNotification(
      data.title || '巴拿马彩票',
      options
    )
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (self as unknown as ServiceWorkerGlobalScope).clients.openWindow(
      event.notification.data.url
    )
  );
});
