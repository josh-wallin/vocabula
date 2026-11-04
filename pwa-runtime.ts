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
      // eSpeak + Gemini clips of the same texts can both be cached (the player prefers Gemini).
      expiration: { maxEntries: 10000 },
      cacheableResponse: { statuses: [200], headers: { 'content-type': 'audio/mpeg' } },
    },
  },
  {
    // Never cache any other API or Access responses.
    urlPattern: ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/'),
    handler: 'NetworkOnly',
  },
];
