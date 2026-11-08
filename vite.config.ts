/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { Plugin } from 'vite'
import { runtimeCaching } from './pwa-caching'

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

// Lecture de l'étiquette (Tesseract) : les modules sont servis par NOTRE domaine (la CSP interdit les CDN) et ne sont ni précachés
// (≈ 5 Mo) ni chargés au démarrage : ils sont téléchargés une fois, à la première lecture d'étiquette, puis gardés pour le hors ligne
// (règle `ocr-modules` ci-dessous). Même chemin en développement (middleware) et en production (fichiers émis dans dist/ocr).
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  // Le navigateur ne télécharge que la variante qu'il sait exécuter (relaxed-simd, puis simd, puis la version de base).
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'fra.traineddata.gz': 'node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz',
}
function ocrAssets(): Plugin {
  return {
    name: 'permajardin-ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '')
        const file = OCR_FILES[name]
        if (!file) return next()
        res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'application/gzip')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(OCR_FILES)) this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(file) })
    },
  }
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

// Budget de taille par chunk (ko non compressés, base 1000 comme Vite). Un dépassement s'affiche en avertissement de build.
// Mesures du 8 nov. 2026 : three 925, maplibre 1 078, index 763 ; marge d'environ 3 à 8 %. Les autres chunks : 900 ko au plus.
const CHUNK_BUDGET_KB: Record<string, number> = { three: 950, maplibre: 1100 }
const DEFAULT_CHUNK_BUDGET_KB = 900
function chunkBudgets(): Plugin {
  return {
    name: 'permajardin-chunk-budgets',
    generateBundle(_options, bundle) {
      for (const [file, item] of Object.entries(bundle)) {
        if (item.type !== 'chunk') continue
        const kb = Buffer.byteLength(item.code) / 1000
        const budget = CHUNK_BUDGET_KB[item.name] ?? DEFAULT_CHUNK_BUDGET_KB
        if (kb > budget) this.warn(`Le chunk « ${item.name} » (${file}) pèse ${kb.toFixed(0)} ko, budget ${budget} ko : voir vite.config.ts.`)
      }
    },
  }
}

// Version et commit affichés en bas de Réglages et dans le diagnostic.
// Sur Vercel, le commit vient de VERCEL_GIT_COMMIT_SHA ; ailleurs, de git ; sans git : « inconnu ».
function appCommit(): string {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA?.trim()
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'inconnu'
  } catch {
    return 'inconnu'
  }
}
const appVersion = (JSON.parse(readFileSync('package.json', 'utf8')) as { version?: string }).version ?? 'inconnue'

// Variables exposées au navigateur : VITE_* et NEIGHBORS_* (URL et clé publiques de l'entraide, sans mot « KEY » : Vercel le refuse).
// Jamais de secret sous ces préfixes.
export default defineConfig({
  envPrefix: ['VITE_', 'NEIGHBORS_'],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit()),
  },
  plugins: [
    react(),
    ocrAssets(),
    chunkBudgets(),
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
        // Le chunk 3D (≈ 925 ko bruts, ≈ 248 ko en gzip, mesuré au build du 8 nov. 2026 ; écran secondaire) n'est pas préchargé à l'installation :
        // il est mis en cache à la première ouverture de la 3D (voir runtimeCaching ci-dessous).
        // MapLibre reste dans le précache : la carte est l'écran d'accueil et doit s'ouvrir hors ligne
        // dès la première installation (son nom ne change qu'avec la bibliothèque, il n'est donc
        // retéléchargé qu'à une mise à jour de MapLibre).
        // Polices autohébergées (DM Serif Display + DM Sans, 2 fichiers woff2 latin, ~60 ko) : précachées pour que le texte s'affiche pareil hors ligne.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['assets/three-*.js', 'push-sw.js', 'ocr/**'],
        // Alertes de nouveaux messages : deux gestionnaires (push, notificationclick) dans public/push-sw.js, chargés par le
        // service worker généré. Le mode « prompt » et le précache ne changent pas. Le navigateur compare aussi ce fichier
        // quand il cherche une nouvelle version. Il n'est pas précaché : il est gardé avec le service worker lui-même.
        importScripts: ['push-sw.js'],
        // Jamais de repli sur index.html pour les fonctions serveur et les proxys.
        navigateFallbackDenylist: [/^\/api\//, /^\/ext\//, /^\/\.well-known\//],
        // Règles dans `pwa-caching.ts` (testées) : règle d'or, jamais de cache pour /api/*, /ext/meteo* ni le géocodage.
        runtimeCaching,
      },
    }),
  ],
  build: {
    rollupOptions: { output: { manualChunks } },
    // Tailles mesurées au build du 8 nov. 2026 (ko non compressés, comme les affiche Vite) :
    // three 925 (≈ 248 en gzip, chargé à la demande par l'écran 3D), maplibre 1 078 (≈ 295 en gzip, précaché : la carte doit s'ouvrir
    // hors ligne ; bibliothèque tierce, indivisible), tout le reste sous 765.
    // L'avertissement de Vite n'a qu'une seule limite pour tous les chunks : on la place juste au-dessus du plus gros (maplibre) pour ne plus
    // avoir de bruit permanent, et `chunkBudgets` (plus haut) garde un budget par chunk pour que three, maplibre ou le code applicatif
    // ne grossissent pas sans qu'on le voie.
    chunkSizeWarningLimit: 1100,
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
