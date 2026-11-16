/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' => funciona em qualquer endereço (GitHub Pages, domínio próprio, abrir local).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'CongelaFit Premium · Freezer, Planner e Receitas',
        short_name: 'CongelaFit',
        description:
          'Organize suas marmitas: freezer com validade, planner da semana, lista de compras e 396 receitas low carb.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F3FAFD',
        theme_color: '#0DA5E8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,json}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Fotos entram no cache conforme são vistas (evita baixar 17 MB na instalação).
            urlPattern: ({ url }) => url.pathname.includes('/img/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'fotos-receitas',
              expiration: { maxEntries: 900, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
