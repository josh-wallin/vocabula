import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { runtimeCaching } from './pwa-runtime.ts';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // public/ icons are matched by globPatterns below; avoid duplicate precache entries.
      includeManifestIcons: false,
      manifest: {
        name: 'Vocābula',
        short_name: 'Vocābula',
        description: "Drill Latin vocabulary and paradigms along Wheelock's Latin.",
        lang: 'en',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#5e2550',
        background_color: '#eceeea',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Precache the whole app shell so it opens offline.
        // woff2: the self-hosted fonts (src/ui/fonts.css, latin + latin-ext only).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        // The Worker API and Cloudflare Access endpoints (/cdn-cgi/access/authorized, /logout)
        // must reach the network as real navigations, or the Access login round-trip breaks.
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
        runtimeCaching,
      },
    }),
  ],
});
