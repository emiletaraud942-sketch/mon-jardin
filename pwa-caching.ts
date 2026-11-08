// Règles de cache d'exécution du service worker (workbox), lues par vite.config.ts et testées dans src/lib/pwaCaching.test.ts.
// Règle d'or : on ne met JAMAIS en cache /api/* (identification), /ext/meteo* (météo, doit rester fraîche),
// le géocodage (/ext/geopf/geocodage), le WFS, l'altimétrie ni l'API Carto : aucune règle ci-dessous ne les couvre.
//
// Chemins /ext/geopf réellement demandés par l'appli :
//   /ext/geopf/wmts                  tuiles photo, plan IGN, cadastre (MapLibre, et « Télécharger ma zone »)  → ign-tuiles
//   /ext/geopf/wms-r                 photo plaquée au sol en 3D et LiDAR (MNH, MNT)                           → ign-ortho-3d
//   /ext/geopf/wfs/ows               bâtiments et parcelles (WFS)                                             → aucun cache
//   /ext/geopf/geocodage/search      adresses                                                                 → aucun cache
//   /ext/geopf/altimetrie/…          relief RGE ALTI                                                          → aucun cache
//   /ext/apicarto/…                  cadastre (API Carto)                                                     → aucun cache
export interface RuntimeRule {
  urlPattern: (ctx: { url: URL }) => boolean
  handler: 'CacheFirst' | 'StaleWhileRevalidate'
  options: {
    cacheName: string
    expiration: { maxEntries: number; maxAgeSeconds: number }
    cacheableResponse: { statuses: number[] }
  }
}

const DAY = 60 * 60 * 24

export const runtimeCaching: RuntimeRule[] = [
  {
    // Chunk 3D chargé à la demande (hash dans le nom : contenu immuable, donc CacheFirst).
    urlPattern: ({ url }) => /^\/assets\/three-[^/]+\.js$/.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: 'chunk-3d',
      expiration: { maxEntries: 3, maxAgeSeconds: DAY * 90 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Modules de lecture de l'étiquette (≈ 5 Mo) : téléchargés à la première lecture, puis servis du cache (hors ligne).
    urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'),
    handler: 'CacheFirst',
    options: {
      cacheName: 'ocr-modules',
      expiration: { maxEntries: 8, maxAgeSeconds: DAY * 365 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Tuiles WMTS (plan, orthophoto, cadastre) : changent rarement. Seules les réponses 200 sont gardées :
    // une tuile absente (404, hors couverture) ou une réponse opaque n'est jamais mise en cache ni rejouée.
    urlPattern: ({ url }) => url.pathname === '/ext/geopf/wmts',
    handler: 'CacheFirst',
    options: {
      cacheName: 'ign-tuiles',
      expiration: { maxEntries: 2000, maxAgeSeconds: DAY * 60 },
      cacheableResponse: { statuses: [200] },
    },
  },
  {
    // Orthophoto plaquée au sol en 3D et LiDAR (WMS raster) : on sert le cache puis on rafraîchit.
    urlPattern: ({ url }) => url.pathname === '/ext/geopf/wms-r',
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'ign-ortho-3d',
      expiration: { maxEntries: 30, maxAgeSeconds: DAY * 14 },
      cacheableResponse: { statuses: [200] },
    },
  },
]
