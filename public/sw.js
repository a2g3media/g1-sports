const SW_SELF_URL = new URL(self.location.href);
const APP_VERSION = SW_SELF_URL.searchParams.get('v') || 'legacy';
const CACHE_NAME = `gz-sports-${APP_VERSION}`;
const STATIC_ASSETS = [
  '/manifest.json',
];

// Install event - cache static assets (not root HTML - use network-first for that)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately - don't wait for old SW to stop
  self.skipWaiting();
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all clients immediately after activation
      return self.clients.claim();
    }).then(() => {
      // Notify all clients that a new version is available
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: APP_VERSION,
            message: 'New version available'
          });
        });
      });
    })
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.source.postMessage({
      type: 'VERSION_INFO',
      version: APP_VERSION,
      cacheName: CACHE_NAME
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - network-first for HTML/navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API requests - network only (don't cache dynamic data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'You appear to be offline' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // Navigation requests (HTML pages) - NETWORK-FIRST to prevent stale app
  if (request.mode === 'navigate' || request.destination === 'document' || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Cache the fresh response for offline use
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Only fall back to cache if network fails (offline)
          return caches.match(request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // JS files - NETWORK-FIRST to ensure fresh code
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Only fall back to cache if network fails (offline)
          return caches.match(request).then((cached) => {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // Other static assets (CSS, images) - cache-first with background update
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version and update in background
        event.waitUntil(
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
          }).catch(() => {})
        );
        return cachedResponse;
      }

      // No cache - fetch from network
      return fetch(request).then((networkResponse) => {
        // Cache successful responses for static assets
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { body: event.data.text() };
  }

  // Determine notification style based on type
  const isLineMovement = data.type === 'line_movement' || data.type === 'odds_alert';
  const isDeadline = data.type === 'deadline_alert';
  const isPickReminder = data.type === 'pick_reminder';
  const isCritical = data.severity === 'CRITICAL';

  // Build actions based on notification type
  let actions = [];
  if (isPickReminder) {
    actions = [
      { action: 'make-picks', title: '📝 Make Picks' },
      { action: 'dismiss', title: 'Dismiss' },
    ];
  } else if (isDeadline) {
    actions = [
      { action: 'make-picks', title: '🚨 Submit Now!' },
    ];
  } else if (isLineMovement) {
    actions = [
      { action: 'view-odds', title: '📊 View Odds' },
      { action: 'watchlist', title: '👀 Watchlist' },
    ];
  }

  const options = {
    body: data.body || 'New update from POOLVAULT',
    icon: data.icon || 'https://019c35cd-bc59-7336-8464-048ca4acc6ad.mochausercontent.com/icons-icon-192x192.png',
    badge: data.badge || 'https://019c35cd-bc59-7336-8464-048ca4acc6ad.mochausercontent.com/icons-icon-72x72.png',
    vibrate: isCritical ? [200, 100, 200, 100, 200] : [200, 100, 200],
    tag: data.tag || `poolvault-${data.type || 'notification'}`,
    renotify: true,
    requireInteraction: isDeadline || isCritical, // Keep important alerts visible
    data: {
      url: data.url || (isLineMovement ? '/watchlist' : '/'),
      notificationId: data.notificationId,
      type: data.type,
      gameId: data.gameId,
      alertId: data.alertId,
    },
    actions,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'POOLVAULT', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = data.url || '/';

  // Handle action buttons based on type
  if (event.action === 'make-picks' && data.url) {
    url = data.url;
  } else if (event.action === 'view-odds') {
    url = data.gameId ? `/odds?game=${data.gameId}` : '/odds';
  } else if (event.action === 'watchlist') {
    url = '/watchlist';
  } else if (event.action === 'dismiss') {
    return;
  }

  // Mark notification as clicked if we have an ID
  if (data.notificationId) {
    event.waitUntil(
      fetch(`/api/notifications/${data.notificationId}/sent`, { method: 'PATCH' })
        .catch(() => {}) // Ignore errors
    );
  }

  // Mark alert as read if we have an alert ID
  if (data.alertId) {
    event.waitUntil(
      fetch(`/api/alerts/events/${data.alertId}/read?scope=PROD`, { 
        method: 'POST',
        credentials: 'include',
      }).catch(() => {}) // Ignore errors
    );
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline picks (future feature)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-picks') {
    event.waitUntil(syncPicks());
  }
});

async function syncPicks() {
  // Future: sync offline picks when back online
  console.log('Background sync triggered');
}
