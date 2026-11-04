/**
 * Workbox runtime caching rules for the service worker (vite.config.ts), kept apart so
 * tests can check them (tests/audio.test.ts). Order matters: the first matching rule wins.
 */
import type { RuntimeCaching } from 'workbox-build';

export const runtimeCaching: RuntimeCaching[] = [
  {
    // Pronunciation clips: immutable per key (the key hashes engine + text), so cache first.
    // Only real 200s are kept: an expired Access session answers with a redirect (status 0 / 3xx).
    urlPattern: ({ url }) => url.pathname.startsWith('/api/audio/'),
    handler: 'CacheFirst',
    options: {
      cacheName: 'audio',
      expiration: { maxEntries: 5000 },
      cacheableResponse: { statuses: [200], headers: { 'content-type': 'audio/mpeg' } },
    },
  },
  {
    // Never cache any other API or Access responses.
    urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/'),
    handler: 'NetworkOnly',
  },
  {
    // Google Fonts: optional; app falls back to system fonts offline.
    urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'google-fonts',
      expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
];
