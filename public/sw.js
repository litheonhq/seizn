/**
 * Seizn Service Worker
 *
 * Provides offline support with caching strategies:
 * - Static assets: Cache-first
 * - API calls: Network-first with cache fallback
 * - Dynamic pages: Stale-while-revalidate
 *
 * @version 1.0.0
 */

const CACHE_VERSION = 'seizn-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Assets to pre-cache on install
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.json',
  // Add other critical static assets
];

// API endpoints to cache
const CACHEABLE_API_PATTERNS = [
  /\/api\/memories\?/,
  /\/api\/profile/,
  /\/api\/context/,
];

// Never cache these
const NO_CACHE_PATTERNS = [
  /\/api\/auth/,
  /\/api\/connectors.*\/callback/,
  /\/_next\/webpack-hmr/,
];

// ===========================================================================
// Install Event
// ===========================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// ===========================================================================
// Activate Event
// ===========================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('seizn-') && name !== CACHE_VERSION)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ===========================================================================
// Fetch Event
// ===========================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip requests we shouldn't cache
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    return;
  }

  // API requests: Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
    return;
  }

  // Static assets: Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Dynamic pages: Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
});

// ===========================================================================
// Caching Strategies
// ===========================================================================

/**
 * Cache-first strategy
 * Good for static assets that rarely change
 */
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first fetch failed:', error);
    return caches.match('/offline');
  }
}

/**
 * Network-first with cache fallback
 * Good for API calls where fresh data is preferred
 */
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);

    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline JSON response for API calls
    return new Response(
      JSON.stringify({
        error: 'offline',
        message: 'You appear to be offline',
        cached: false,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Stale-while-revalidate
 * Good for pages where showing cached content quickly is important
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await caches.match(request);

  // Fetch fresh data in background
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      // Return cached or offline page
      return cachedResponse || caches.match('/offline');
    });

  // Return cached response immediately, or wait for network
  return cachedResponse || fetchPromise;
}

// ===========================================================================
// Helper Functions
// ===========================================================================

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/static/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.ico')
  );
}

// ===========================================================================
// Background Sync
// ===========================================================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-memories') {
    event.waitUntil(syncMemories());
  }

  if (event.tag === 'sync-candidates') {
    event.waitUntil(syncCandidates());
  }
});

async function syncMemories() {
  try {
    // Get pending operations from IndexedDB
    const pending = await getPendingOperations('memories');

    for (const operation of pending) {
      await processOperation(operation);
      await removePendingOperation('memories', operation.id);
    }

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        payload: { count: pending.length },
      });
    });
  } catch (error) {
    console.error('[SW] Sync failed:', error);
    throw error; // Will retry
  }
}

async function syncCandidates() {
  // Similar to syncMemories
  console.log('[SW] Syncing candidates...');
}

// ===========================================================================
// IndexedDB Helpers (for sync queue)
// ===========================================================================

const DB_NAME = 'seizn-offline';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Pending operations store
      if (!db.objectStoreNames.contains('pending-operations')) {
        const store = db.createObjectStore('pending-operations', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Cached data store
      if (!db.objectStoreNames.contains('cached-data')) {
        const store = db.createObjectStore('cached-data', { keyPath: 'key' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('expiry', 'expiry', { unique: false });
      }
    };
  });
}

async function getPendingOperations(type) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-operations', 'readonly');
    const store = tx.objectStore('pending-operations');
    const index = store.index('type');
    const request = index.getAll(type);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removePendingOperation(type, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending-operations', 'readwrite');
    const store = tx.objectStore('pending-operations');
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function processOperation(operation) {
  const response = await fetch(operation.url, {
    method: operation.method,
    headers: operation.headers,
    body: operation.body,
  });

  if (!response.ok) {
    throw new Error(`Operation failed: ${response.status}`);
  }

  return response.json();
}

// ===========================================================================
// Message Handler
// ===========================================================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      cacheUrls(payload.urls);
      break;

    case 'CLEAR_CACHE':
      clearCache(payload?.cacheName);
      break;

    case 'GET_CACHE_STATUS':
      getCacheStatus().then((status) => {
        event.ports[0].postMessage(status);
      });
      break;
  }
});

async function cacheUrls(urls) {
  const cache = await caches.open(DYNAMIC_CACHE);
  await cache.addAll(urls);
}

async function clearCache(cacheName) {
  if (cacheName) {
    await caches.delete(cacheName);
  } else {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
}

async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {};

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    status[name] = keys.length;
  }

  return status;
}

// ===========================================================================
// Push Notifications (if needed)
// ===========================================================================

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    data: data.url,
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.notification.data) {
    event.waitUntil(clients.openWindow(event.notification.data));
  }
});

console.log('[SW] Service worker loaded');
