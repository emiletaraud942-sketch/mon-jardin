/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Les mêmes préfixes sont réécrits par vercel.json en production :
// le navigateur n'appelle que notre domaine (pas de souci CORS).
// Ordre important : Vite teste les préfixes par `startsWith` dans l'ordre d'insertion,
// donc '/ext/meteo-archive' doit précéder '/ext/meteo'.
const proxies = {
  '/ext/geopf': 'https://data.geopf.fr',
  '/ext/apicarto': 'https://apicarto.ign.fr',
  '/ext/meteo-archive': 'https://archive-api.open-meteo.com',
  '/ext/meteo': 'https://api.open-meteo.com',
}

// Découpage des bundles : chaque grosse bibliothèque a son chunk, au hash stable.
// Un changement de code applicatif ne force donc pas à retélécharger React, MapLibre ou Three.
// L'ordre compte : '@react-three' et 'three-stdlib' doivent être testés avant 'react'.
function manualChunks(id: string): string | undefined {
  // L'utilitaire de préchargement des imports dynamiques doit vivre dans un chunk toujours chargé.
  // Sans cette ligne, Rollup le range dans le premier chunk manuel qui l'utilise (ex. `three`) :
  // le point d'entrée dépendrait alors du chunk 3D et le chargerait au démarrage.
  if (id.includes('vite/preload-helper')) return 'react'
  if (!id.includes('node_modules')) return undefined
  if (/node_modules\/(three|three-stdlib|@react-three)\//.test(id)) return 'three'
  if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
  if (id.includes('node_modules/maplibre-gl/')) return 'maplibre'
  if (id.includes('node_modules/@supabase/')) return 'supabase'
  return undefined
}

// Variables exposées au navigateur : VITE_* et NEIGHBORS_* (URL et clé publiques de l'entraide, sans mot « KEY » : Vercel le refuse).
// Jamais de secret sous ces préfixes.
export default defineConfig({
  envPrefix: ['VITE_', 'NEIGHBORS_'],
  plugins: [
    react(),
    VitePWA({
      // « prompt » : le nouveau service worker attend (pas de skipWaiting automatique).
      // L'interface propose « Nouvelle version — Recharger » (virtual:pwa-register/react),
      // qui envoie le message SKIP_WAITING ; on ne recharge jamais la page sans prévenir.
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'PermaJardin',
        short_name: 'PermaJardin',
        description: 'Cartographier son jardin en 3D, choisir quoi planter où et savoir quand entretenir.',
        lang: 'fr',
        dir: 'ltr',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'any',
        categories: ['lifestyle', 'productivity', 'utilities'],
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Pas de skipWaiting/clientsClaim automatiques : la prise de contrôle se fait
        // sur message SKIP_WAITING (voir registerType).
        skipWaiting: false,
        clientsClaim: false,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Le chunk 3D (~860 ko, ~230 ko en gzip, écran secondaire) n'est pas préchargé à l'installation :
        // il est mis en cache à la première ouverture de la 3D (voir runtimeCaching ci-dessous).
        // MapLibre reste dans le précache : la carte est l'écran d'accueil et doit s'ouvrir hors ligne
        // dès la première installation (son nom ne change qu'avec la bibliothèque, il n'est donc
        // retéléchargé qu'à une mise à jour de MapLibre).
        // Polices autohébergées (DM Serif Display + DM Sans, 2 fichiers woff2 latin, ~60 ko) : précachées pour que le texte s'affiche pareil hors ligne.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['assets/three-*.js', 'push-sw.js'],
        // Alertes de nouveaux messages : deux gestionnaires (push, notificationclick) dans public/push-sw.js, chargés par le
        // service worker généré. Le mode « prompt » et le précache ne changent pas. Le navigateur compare aussi ce fichier
        // quand il cherche une nouvelle version. Il n'est pas précaché : il est gardé avec le service worker lui-même.
        importScripts: ['push-sw.js'],
        // Jamais de repli sur index.html pour les fonctions serveur et les proxys.
        navigateFallbackDenylist: [/^\/api\//, /^\/ext\//, /^\/\.well-known\//],
        // Règle d'or : on ne met JAMAIS en cache /api/* (identification), /ext/meteo*
        // (météo, doit rester fraîche) ni le géocodage (/ext/geopf/geocodage) :
        // aucune des règles ci-dessous ne les couvre.
        runtimeCaching: [
          {
            // Chunk 3D chargé à la demande (hash dans le nom : contenu immuable, donc CacheFirst).
            urlPattern: ({ url }) => /^\/assets\/three-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'chunk-3d',
              expiration: { maxEntries: 3, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Tuiles WMTS (plan, orthophoto, cadastre) : changent rarement.
            urlPattern: ({ url }) => url.pathname.startsWith('/ext/geopf/wmts'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ign-tuiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Orthophoto plaquée au sol en 3D (WMS raster) : on sert le cache puis on rafraîchit.
            urlPattern: ({ url }) => url.pathname.startsWith('/ext/geopf/wms-r'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ign-ortho-3d',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: { output: { manualChunks } },
    // 900 ko (non compressés) : le chunk Three.js + drei pèse ~700-800 ko minifié (~200 ko en gzip),
    // il est chargé à la demande (écran 3D) et ne figure pas dans le chargement initial.
    // L'alerte par défaut (500 ko) serait un bruit permanent ; elle reste utile au-delà de 900 ko.
    chunkSizeWarningLimit: 900,
  },
  server: {
    proxy: Object.fromEntries(
      Object.entries(proxies).map(([prefix, target]) => [
        prefix,
        { target, changeOrigin: true, rewrite: (p: string) => p.replace(prefix, '') },
      ]),
    ),
  },
  test: { environment: 'node' },
})
