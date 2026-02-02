const CACHE_NAME = 'p2p-chat-v1';

// 核心资源缓存列表
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
];

// 安装事件
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 拦截请求
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // 缓存命中，返回缓存
      if (response) {
        console.log('[SW] Cache hit:', event.request.url);
        return response;
      }

      // 克隆请求
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest).then((response) => {
        // 检查是否为有效响应
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // 克隆响应
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // 网络请求失败，返回离线页面
        console.log('[SW] Network failed, returning offline page');
        return caches.match('/offline.html');
      });
    })
  );
});

// 后台同步
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncPendingMessages());
  }
});

// 推送通知
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '您有新消息',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: 'explore',
        title: '查看',
        icon: '/icon-96x96.png',
      },
      {
        action: 'close',
        title: '关闭',
        icon: '/icon-96x96.png',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification('P2P Chat', options)
  );
});

// 通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/#/wechat')
    );
  }
});

// 同步待发送消息
async function syncPendingMessages() {
  // 从 IndexedDB 读取待发送消息
  // 尝试重新发送
  // 这里需要与主应用通信，使用 postMessage 或 IndexedDB
  console.log('[SW] Syncing pending messages...');
}
