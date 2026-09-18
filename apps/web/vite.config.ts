import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(dir, '../..'), '');
  const apiUrl = env.VITE_API_URL || 'http://localhost:4000';

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'sounds/*.wav'],
        manifest: {
          name: 'POS - Sistema de Ponto de Venda',
          short_name: 'POS',
          description: 'Retalho, restauracao e loja online num so sistema.',
          lang: 'pt-PT',
          theme_color: '#006AFF',
          background_color: '#0B0F17',
          display: 'standalone',
          orientation: 'landscape',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: '/icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,wav}'],
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
          runtimeCaching: [
            {
              // Catalogue reads stay usable when the connection drops.
              urlPattern: /\/api\/(products|categories|settings|entities)/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'pos-catalogue',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
            {
              urlPattern: /\/uploads\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pos-images',
                expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(dir, './src'),
        '@pos/shared': path.resolve(dir, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: apiUrl, changeOrigin: true },
        '/uploads': { target: apiUrl, changeOrigin: true },
        '/socket.io': { target: apiUrl, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
