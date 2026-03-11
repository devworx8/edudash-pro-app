/**
 * Service Worker for EduDash Pro PWA - Mobile Web Gating
 * 
 * CRITICAL: Only caches manifest + icons for PWA installation.
 * The app shell ("/") is NOT cached, allowing the mobile-web gating to run.
 * 
 * Cache Strategy:
 * - Manifest + Icons ONLY: cache-first
 * - All other requests: network-only (no caching)
 * - Protected routes: network-only (never cached)
 * - Cross-origin (Supabase, APIs): network-only (never cached)
 */

const CACHE_NAME = 'edudash-static-v4'; // Bumped to v4 for apple-touch-icon
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon-180.png',
];
// NOTE: "/" NOT included to allow gating logic to run

// Install: Pre-cache minimal shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate: Take control and clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch: Handle requests with security-first caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // SECURITY: Skip cross-origin requests (Supabase, external APIs)
  // These must always go to network for real-time data and auth
  if (url.origin !== self.location.origin) {
    return; // Network-only for all external requests
  }

  // SECURITY: Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (event.request.method !== 'GET') {
    return; // Network-only for mutations
  }

  // SECURITY CRITICAL: NEVER cache protected routes
  // These contain user data and must always be fresh from server
  const protectedPatterns = [
    '/(parent)',
    '/(teacher)',
    '/(principal)',
    '/dashboard',
    '/screens/',
    '/students',
    '/teachers',
    '/classes',
    '/assignments',
    '/messages',
    '/reports',
    '/settings',
    '/profile',
    '/account',
  ];

  const isProtected = protectedPatterns.some(pattern => 
    url.pathname.startsWith(pattern)
  );

  if (isProtected) {
    console.log('[SW] Protected route - network only:', url.pathname);
    return; // Network-only for protected routes
  }

  // Auth routes should not be cached
  if (url.pathname.startsWith('/(auth)') || url.pathname.includes('/sign-')) {
    return; // Network-only for auth flows
  }

  // Strategy 1: Cache-first for static assets (icons, manifest)
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => {
          if (cached) {
            console.log('[SW] Cache hit (static):', url.pathname);
            return cached;
          }
          
          // Not in cache, fetch and cache
          return fetch(event.request)
            .then((response) => {
              // Only cache successful responses
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, responseClone));
              }
              return response;
            })
            .catch((error) => {
              console.error('[SW] Fetch failed for static asset:', url.pathname, error);
              throw error;
            });
        })
    );
    return;
  }

  // All other routes: network-only (no caching)
  // This includes marketing pages, landing pages, etc.
  // Mobile web gating logic runs fresh every time.
  console.log('[SW] Network-only:', url.pathname);
  return; // Let browser fetch handle it
});

// Message handler for cache management (optional, for future use)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[SW] Service worker loaded');
