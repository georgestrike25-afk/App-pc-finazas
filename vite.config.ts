/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /App-pc-finazas/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'favicon.png', 'theme-init.js'],
      manifest: {
        name: 'Brote: tus finanzas, en crecimiento',
        short_name: 'Brote',
        description: 'Gestión local y privada de ingresos, gastos, cuotas, gastos compartidos y ahorro.',
        lang: 'es-AR',
        dir: 'ltr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#072e2c',
        theme_color: '#123c3a',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest,woff2}'],
        globIgnores: ['ocr/**'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Recursos de OCR (~10 MB): se guardan en caché al primer uso o con "Preparar OCR sin conexión".
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets', expiration: { maxEntries: 10 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  worker: { format: 'es' },
  test: {
    // VITEST_LOCAL=1 ejecuta pruebas con documentos reales del usuario (tests/local, no versionado).
    include: process.env.VITEST_LOCAL ? ['tests/local/**/*.test.ts'] : ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
    testTimeout: 60000,
  },
});
