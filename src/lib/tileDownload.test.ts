import { describe, expect, it, vi } from 'vitest'
import { MAX_ZONE_TILES, TILE_ZOOMS, downloadMessage, downloadTiles, estimateBytes, planZone, tileOf, tilePath, tilesForRect, zoneRect, type TileCacheLike } from './tileDownload'

// Point mesuré par le propriétaire (27 oct. 2026) : Normandie.
const CENTER = { lon: 1.0411, lat: 49.5328 }
const PARCEL = [{ x: -12, y: -10 }, { x: 12, y: -10 }, { x: 12, y: 10 }, { x: -12, y: 10 }]

describe('calcul des tuiles', () => {
  it('tileOf : tuiles connues (Greenwich z0, Paris z10)', () => {
    expect(tileOf({ lon: 0, lat: 0 }, 1)).toEqual({ x: 1, y: 1 })
    expect(tileOf({ lon: 2.3522, lat: 48.8566 }, 10)).toEqual({ x: 518, y: 352 })
    expect(tileOf({ lon: -179.9, lat: 84 }, 3)).toEqual({ x: 0, y: 0 })
  })
  it('tilesForRect : un seul niveau, bloc rectangulaire de tuiles voisines', () => {
    const t = tilesForRect(CENTER, { minX: -100, maxX: 100, minY: -100, maxY: 100 }, [19])
    const xs = [...new Set(t.map((q) => q.x))]
    const ys = [...new Set(t.map((q) => q.y))]
    expect(t).toHaveLength(xs.length * ys.length)
    expect(Math.max(...xs) - Math.min(...xs)).toBe(xs.length - 1)
    expect(t.every((q) => q.z === 19)).toBe(true)
    expect(xs.length).toBeGreaterThanOrEqual(4) // 200 m / ≈ 50 m par tuile
    expect(t.some((q) => q.x === tileOf(CENTER, 19).x && q.y === tileOf(CENTER, 19).y)).toBe(true) // contient le centre
  })
  it('affiche le nombre de tuiles (information)', () => {
    const plan = planZone({ center: CENTER, parcel: PARCEL })
    const par = Object.fromEntries(TILE_ZOOMS.map((z) => [z, plan.tiles.filter((t) => t.z === z).length]))
    expect(par[19]).toBeGreaterThan(40)
    expect(plan.tiles.length).toBeGreaterThan(0)
  })
  it('petite parcelle + 150 m : 50 à 150 tuiles sur z15 à z19', () => {
    const plan = planZone({ center: CENTER, parcel: PARCEL })
    expect(plan.marginM).toBe(150)
    expect(plan.tiles.length).toBeGreaterThanOrEqual(50)
    expect(plan.tiles.length).toBeLessThanOrEqual(MAX_ZONE_TILES)
    expect(new Set(plan.tiles.map((t) => t.z))).toEqual(new Set(TILE_ZOOMS))
    // z, x, y : coordonnées valides, sans doublon
    expect(new Set(plan.tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(plan.tiles.length)
    for (const t of plan.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0)
      expect(t.x).toBeLessThan(2 ** t.z)
      expect(t.y).toBeLessThan(2 ** t.z)
    }
    expect(estimateBytes(plan.tiles.length)).toBeLessThan(6 * 1024 * 1024)
  })
  it('sans parcelle connue : zone autour du centre', () => {
    const plan = planZone({ center: CENTER })
    expect(plan.tiles.length).toBeGreaterThanOrEqual(30)
    expect(plan.tiles.length).toBeLessThanOrEqual(MAX_ZONE_TILES)
  })
  it('grande parcelle : le plafond de 150 tuiles tient (marge réduite, puis zone resserrée)', () => {
    const big = [{ x: -250, y: -250 }, { x: 250, y: -250 }, { x: 250, y: 250 }, { x: -250, y: 250 }]
    const plan = planZone({ center: CENTER, parcel: big })
    expect(plan.tiles.length).toBeLessThanOrEqual(MAX_ZONE_TILES)
    expect(plan.tiles.length).toBeGreaterThan(0)
    expect(plan.marginM).toBeLessThan(150)
    const huge = [{ x: -5000, y: -5000 }, { x: 5000, y: 5000 }, { x: -5000, y: 5000 }]
    expect(planZone({ center: CENTER, parcel: huge }).tiles.length).toBeLessThanOrEqual(MAX_ZONE_TILES)
    expect(planZone({ center: CENTER, parcel: PARCEL }, { cap: 20 }).tiles.length).toBeLessThanOrEqual(20)
  })
  it('zoneRect : englobe la parcelle + marge', () => {
    expect(zoneRect(PARCEL, 150)).toEqual({ minX: -162, maxX: 162, minY: -160, maxY: 160 })
  })
  it('toutes les adresses demandées sont /ext/geopf/wmts, couche photo, même gabarit que MapLibre', () => {
    for (const t of planZone({ center: CENTER, parcel: PARCEL }).tiles) {
      const u = new URL(tilePath(t), 'https://x.test')
      expect(u.pathname).toBe('/ext/geopf/wmts')
      expect(u.searchParams.get('LAYER')).toBe('ORTHOIMAGERY.ORTHOPHOTOS')
      expect(u.searchParams.get('TILEMATRIX')).toBe(String(t.z))
      expect(u.searchParams.get('TILECOL')).toBe(String(t.x))
      expect(u.searchParams.get('TILEROW')).toBe(String(t.y))
    }
  })
})

function memCache(): TileCacheLike & { store: Map<string, Response> } {
  const store = new Map<string, Response>()
  return {
    store,
    async match(k) {
      return store.get(k)?.clone()
    },
    async put(k, r) {
      store.set(k, r)
    },
  }
}
const png = (status = 200, type = 'image/jpeg') => new Response(status === 200 ? new Uint8Array([1, 2, 3]) : '', { status, headers: { 'content-type': type, vary: 'Accept' } })
const ORIGIN = 'https://app.test'

describe('downloadTiles', () => {
  const tiles = planZone({ center: CENTER, parcel: PARCEL }).tiles

  it('garde les 200, ignore les 404 (jamais en cache), concurrence ≤ 4, aucune requête hors wmts', async () => {
    const cache = memCache()
    let running = 0
    let peak = 0
    const urls: string[] = []
    const fetchTile = vi.fn(async (url: string) => {
      urls.push(url)
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 2))
      running--
      return urls.length % 10 === 0 ? png(404) : png()
    })
    const progress: number[] = []
    const r = await downloadTiles(tiles, { cache, fetchTile, origin: ORIGIN, gapMs: 0, onProgress: (p) => progress.push(p.done) })
    expect(peak).toBeLessThanOrEqual(4)
    expect(r.kept + r.missing + r.failed).toBe(tiles.length)
    expect(r.missing).toBeGreaterThan(0)
    expect(cache.store.size).toBe(r.kept)
    expect(urls.every((u) => new URL(u).origin === ORIGIN && new URL(u).pathname === '/ext/geopf/wmts')).toBe(true)
    expect(progress.at(-1)).toBe(tiles.length)
    // Aucune tuile 404 en cache ; en-tête Vary retiré (clé de cache indépendante des en-têtes de requête).
    for (const res of cache.store.values()) {
      expect(res.status).toBe(200)
      expect(res.headers.get('vary')).toBeNull()
      expect(res.headers.get('content-type')).toBe('image/jpeg')
    }
  })

  it('relancer ne retélécharge pas ce qui est déjà gardé', async () => {
    const cache = memCache()
    const fetchTile = vi.fn(async () => png())
    await downloadTiles(tiles.slice(0, 20), { cache, fetchTile, origin: ORIGIN, gapMs: 0 })
    expect(fetchTile).toHaveBeenCalledTimes(20)
    const r = await downloadTiles(tiles.slice(0, 25), { cache, fetchTile, origin: ORIGIN, gapMs: 0 })
    expect(fetchTile).toHaveBeenCalledTimes(25)
    expect(r.kept).toBe(25)
  })

  it('annulation : arrête les envois, garde ce qui est déjà là', async () => {
    const cache = memCache()
    const ctrl = new AbortController()
    let n = 0
    const fetchTile = vi.fn(async () => {
      if (++n === 8) ctrl.abort()
      await new Promise((r) => setTimeout(r, 2))
      return png()
    })
    const r = await downloadTiles(tiles, { cache, fetchTile, origin: ORIGIN, gapMs: 0, signal: ctrl.signal })
    expect(r.cancelled).toBe(true)
    expect(fetchTile.mock.calls.length).toBeLessThan(tiles.length)
    expect(cache.store.size).toBe(r.kept)
    expect(downloadMessage(r)).toMatch(/^Arrêté/)
  })

  it('429 : arrêt net, message clair, pas de boucle', async () => {
    const cache = memCache()
    const fetchTile = vi.fn(async () => new Response('', { status: 429 }))
    const r = await downloadTiles(tiles, { cache, fetchTile, origin: ORIGIN, gapMs: 0 })
    expect(r.rateLimited).toBe(true)
    expect(fetchTile.mock.calls.length).toBeLessThanOrEqual(8) // quelques requêtes déjà parties, pas 100
    expect(r.kept).toBe(0)
    expect(downloadMessage(r)).toMatch(/très sollicité/)
  })

  it('réponse qui n’est pas une image, erreur réseau : comptées en échec, jamais gardées', async () => {
    const cache = memCache()
    let n = 0
    const fetchTile = vi.fn(async () => {
      n++
      if (n % 2) throw new Error('Connexion impossible.')
      return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
    })
    const r = await downloadTiles(tiles.slice(0, 10), { cache, fetchTile, origin: ORIGIN, gapMs: 0 })
    expect(r.failed).toBe(10)
    expect(cache.store.size).toBe(0)
  })

  it('messages en mots simples', () => {
    expect(downloadMessage({ kept: 96, cancelled: false, rateLimited: false, total: 96 })).toBe('96 tuiles gardées, la carte marchera sans internet autour de votre jardin.')
    expect(downloadMessage({ kept: 0, cancelled: false, rateLimited: false, total: 96 })).toMatch(/Aucune tuile/)
  })
})
