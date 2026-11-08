import { describe, expect, it } from 'vitest'
import { runtimeCaching } from '../../pwa-caching'
import { CADASTRE_TILES, ORTHO_TILES, PLAN_TILES, orthoTextureUrl } from './ign'
import { lidarUrl } from './lidar'

const ORIGIN = 'https://mon-jardin-app.vercel.app'
const rule = (path: string) => runtimeCaching.find((r) => r.urlPattern({ url: new URL(path, ORIGIN) }))
const tile = (t: string) => t.replace('{z}', '19').replace('{x}', '270000').replace('{y}', '180000')

describe('règles de cache du service worker', () => {
  it('les tuiles WMTS (photo, plan, cadastre) vont dans ign-tuiles, en CacheFirst', () => {
    for (const t of [ORTHO_TILES, PLAN_TILES, CADASTRE_TILES]) {
      const r = rule(tile(t))
      expect(r?.options.cacheName).toBe('ign-tuiles')
      expect(r?.handler).toBe('CacheFirst')
    }
  })
  it('ign-tuiles ne garde que les réponses 200 (ni 404, ni opaque)', () => {
    const r = runtimeCaching.find((x) => x.options.cacheName === 'ign-tuiles')!
    expect(r.options.cacheableResponse).toEqual({ statuses: [200] })
    for (const x of runtimeCaching) {
      expect(x.options.cacheableResponse.statuses, x.options.cacheName).not.toContain(0)
      expect(x.options.cacheableResponse.statuses, x.options.cacheName).not.toContain(404)
    }
  })
  it('les chemins /ext/geopf réellement demandés : wmts et wms-r seulement', () => {
    expect(rule(orthoTextureUrl({ lon: 1, lat: 49 }, 40))?.options.cacheName).toBe('ign-ortho-3d')
    expect(rule(lidarUrl('mnh', { lon: 1, lat: 49 }, 60))?.options.cacheName).toBe('ign-ortho-3d')
    const jamais = [
      '/ext/geopf/wfs/ows?SERVICE=WFS&REQUEST=GetFeature',
      '/ext/geopf/geocodage/search?q=rue',
      '/ext/geopf/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=1&lat=2',
      '/ext/apicarto/api/cadastre/parcelle?geom=x',
      '/ext/meteo/v1/forecast?latitude=49',
      '/ext/meteo-archive/v1/archive?latitude=49',
      '/api/identify',
    ]
    for (const p of jamais) expect(rule(p), p).toBeUndefined()
  })
  it('un chemin voisin (wmts-autre, wmts/…) ne tombe pas dans le cache', () => {
    expect(rule('/ext/geopf/wmts-autre?x=1')).toBeUndefined()
    expect(rule('/ext/geopf/wmts/extra')).toBeUndefined()
  })
})
