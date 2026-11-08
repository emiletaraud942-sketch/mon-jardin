import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTerrain,
  buildingHeight,
  fetchBuildings,
  fetchParcel,
  fetchTerrain,
  fillMissing,
  geocode,
  getJson,
  CADASTRE_MAXZOOM,
  ORTHO_MAXZOOM,
  PLAN_MAXZOOM,
  orthoBbox,
  orthoTextureUrl,
  parseElevations,
  pickParcel,
  terrainPoints,
  toMercator,
  wfsBbox,
} from './ign'
import { toLocal } from './geo'

// Réponses réelles capturées (octobre 2026) autour du 12 rue des Chalâtres, Nantes, raccourcies.
const GEOCODE = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-1.530962, 47.225652] },
      properties: {
        label: '12 Rue des Chalâtres 44000 Nantes',
        score: 0.62,
        housenumber: '12',
        id: '44109_1560_00012',
        name: '12 Rue des Chalâtres',
        postcode: '44000',
        citycode: '44109',
        city: 'Nantes',
        type: 'housenumber',
        _type: 'address',
      },
    },
  ],
  query: '12 rue des Lilas 44000 Nantes',
}

const PARCEL_BW0010 = {
  type: 'Feature',
  id: 'parcelle.3513873',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [[[
      [-1.53098945, 47.22568667], [-1.53089603, 47.22572323], [-1.53088843, 47.22572732],
      [-1.53077085, 47.22577241], [-1.53063775, 47.22582343], [-1.53059644, 47.22578564],
      [-1.53056031, 47.22575278], [-1.53069201, 47.22570083], [-1.53080192, 47.22565739],
      [-1.53082101, 47.22564988], [-1.53085766, 47.22563555], [-1.53092581, 47.22560863],
      [-1.53098945, 47.22568667],
    ]]],
  },
  geometry_name: 'geom',
  properties: {
    gid: 491991, numero: '0010', feuille: 1, section: 'BW', code_dep: '44', nom_com: 'Nantes',
    code_com: '109', com_abs: '000', code_arr: '000', idu: '44109000BW0010', contenance: 298, code_insee: '44109',
  },
}
const PARCEL_BW0011 = {
  type: 'Feature',
  id: 'parcelle.7331552',
  geometry: {
    type: 'MultiPolygon',
    coordinates: [[[
      [-1.53088688, 47.22555974], [-1.53092581, 47.22560863], [-1.53085766, 47.22563555],
      [-1.53082101, 47.22564988], [-1.53080192, 47.22565739], [-1.53069201, 47.22570083],
      [-1.53056031, 47.22575278], [-1.53052217, 47.22571956], [-1.5305176, 47.22571559],
      [-1.53050476, 47.22570464], [-1.53055025, 47.22568681], [-1.53063276, 47.22565599],
      [-1.53076212, 47.22560764], [-1.53079125, 47.22559676], [-1.53079969, 47.22559327],
      [-1.53088688, 47.22555974],
    ]]],
  },
  properties: { idu: '44109000BW0011', contenance: 201, nom_com: 'Nantes' },
}
const EMPTY = { type: 'FeatureCollection', features: [], totalFeatures: 0, numberMatched: 0, numberReturned: 0, crs: null }

const BUILDINGS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'batiment.19941695',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[
          [-1.53097755, 47.22569633, 15.2], [-1.53088397, 47.22573245, 15.2], [-1.53087643, 47.22573726, 15.2],
          [-1.53093844, 47.22581328, 15.2], [-1.53104096, 47.2257732, 15.2], [-1.53097755, 47.22569633, 15.2],
        ]]],
      },
      geometry_name: 'geometrie',
      properties: { cleabs: 'BATIMENT0000000303977009', usage_1: 'Résidentiel', nombre_d_etages: 3, hauteur: 8.5 },
    },
    {
      type: 'Feature',
      id: 'batiment.x',
      geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0, 1], [1e-4, 0, 1], [1e-4, 1e-4, 1], [0, 0, 1]]]] },
      properties: { cleabs: 'BATIMENT_SANS_HAUTEUR', nombre_d_etages: 2, hauteur: null },
    },
  ],
  numberMatched: 7,
  numberReturned: 2,
}

const center = { lon: -1.530962, lat: 47.225652 }

function stubFetch(routes: [RegExp, unknown][]) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const r = routes.find(([re]) => re.test(url))
      if (!r) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(r[1]), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('geocode', () => {
  it('renvoie [] sous 3 caractères sans appel réseau', async () => {
    const calls = stubFetch([])
    expect(await geocode('ab')).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('parse la réponse Géoplateforme et met en cache', async () => {
    const calls = stubFetch([[/geocodage\/search/, GEOCODE]])
    const r = await geocode('12 rue des Chalâtres Nantes')
    expect(r[0]).toEqual({
      label: '12 Rue des Chalâtres 44000 Nantes',
      lon: -1.530962,
      lat: 47.225652,
      city: 'Nantes',
      postcode: '44000',
      citycode: '44109',
    })
    expect(calls[0]).toContain('/ext/geopf/geocodage/search?q=12%20rue')
    expect(calls[0]).toContain('index=address')
    await geocode('12 rue des chalâtres nantes ')
    expect(calls).toHaveLength(1)
  })

  it('message en français en cas d’erreur HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(geocode('zzz introuvable')).rejects.toThrow(/Géoplateforme IGN.*503/)
  })

  it('réessaie une fois après une erreur 5xx', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (++n === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify(GEOCODE)))),
    )
    const r = await geocode('retry 5xx nantes')
    expect(n).toBe(2)
    expect(r).toHaveLength(1)
  })

  it('réessaie une fois après une erreur réseau, mais pas après un 404', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (++n === 1) throw new TypeError('Failed to fetch')
        return new Response(JSON.stringify(GEOCODE))
      }),
    )
    expect(await geocode('retry reseau nantes')).toHaveLength(1)
    expect(n).toBe(2)
    const f404 = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', f404)
    await expect(geocode('introuvable 404')).rejects.toThrow(/404/)
    expect(f404).toHaveBeenCalledTimes(1)
  })

  it('429 puis 200 : attend `Retry-After` (borné) au lieu de 600 ms fixes', async () => {
    vi.useFakeTimers()
    try {
      const times: number[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          times.push(Date.now())
          return times.length === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } }) : new Response(JSON.stringify(GEOCODE))
        }),
      )
      const p = geocode('retry after nantes')
      await vi.advanceTimersByTimeAsync(1999)
      expect(times).toHaveLength(1) // pas de réessai avant les 2 s demandées
      await vi.advanceTimersByTimeAsync(2)
      expect(await p).toHaveLength(1)
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(2000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Retry-After de 60 s : l’attente reste bornée à 5 s', async () => {
    vi.useFakeTimers()
    try {
      let n = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => (++n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '60' } }) : new Response(JSON.stringify(GEOCODE)))),
      )
      const p = geocode('retry borne nantes')
      await vi.advanceTimersByTimeAsync(5001)
      expect(await p).toHaveLength(1)
      expect(n).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('429 sans en-tête : repli de 600 ms', async () => {
    vi.useFakeTimers()
    try {
      let n = 0
      vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? new Response('', { status: 429 }) : new Response(JSON.stringify(GEOCODE)))))
      const p = geocode('retry sans entete nantes')
      await vi.advanceTimersByTimeAsync(601)
      expect(await p).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('429 persistant : erreur claire après deux réessais, pas de boucle', async () => {
    vi.useFakeTimers()
    try {
      const f = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      vi.stubGlobal('fetch', f)
      const p = geocode('retry persistant nantes').catch((e) => e as Error)
      await vi.advanceTimersByTimeAsync(60_000)
      const e = await p
      expect(e).toBeInstanceOf(Error)
      expect((e as Error).message).toMatch(/très sollicité/)
      expect((e as Error).message).not.toMatch(/429/)
      expect(f).toHaveBeenCalledTimes(3) // 1 essai + 2 réessais, puis arrêt
    } finally {
      vi.useRealTimers()
    }
  })

  it('annuler pendant l’attente d’un 429 interrompt le délai', async () => {
    const ctrl = new AbortController()
    const f = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '5' } }))
    vi.stubGlobal('fetch', f)
    const t0 = Date.now()
    const p = geocode('retry annule nantes', { signal: ctrl.signal }).catch((e) => e as Error)
    setTimeout(() => ctrl.abort(), 20)
    expect(await p).toMatchObject({ name: 'AbortError' })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('limiteur : une file de 10 requêtes ne dépasse jamais le plafond', async () => {
    const { createLimiter } = await import('./http')
    const lim = createLimiter(2)
    let running = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        running++
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 5))
        running--
        return new Response('{"ok":true}')
      }),
    )
    await Promise.all(Array.from({ length: 10 }, (_, i) => getJson(`/ext/geopf/x?${i}`, { limiter: lim })))
    expect(peak).toBe(2)
  })

  it('signal déjà annulé : AbortError sans appel réseau', async () => {
    const calls = stubFetch([[/geocodage/, GEOCODE]])
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(geocode('adresse annulee', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls).toHaveLength(0)
  })

  it('annulation pendant la requête : AbortError', async () => {
    const ctrl = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise<Response>((_res, rej) => {
            init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
          }),
      ),
    )
    const pr = geocode('adresse en vol', { signal: ctrl.signal })
    ctrl.abort()
    await expect(pr).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('fetchParcel', () => {
  it('prend la parcelle API Carto contenant le point', async () => {
    const inside = { lon: -1.5308, lat: 47.2257 }
    const calls = stubFetch([[/apicarto/, { type: 'FeatureCollection', features: [PARCEL_BW0010] }]])
    const p = await fetchParcel(inside)
    expect(p?.ref).toBe('44109000BW0010')
    expect(p?.contenanceM2).toBe(298)
    expect(p?.commune).toBe('Nantes')
    expect(p?.rings).toHaveLength(1)
    expect(p?.rings[0]).toHaveLength(12) // point de fermeture retiré
    expect(decodeURIComponent(calls[0])).toContain('geom={"type":"Point","coordinates":[-1.5308,47.2257]}')
  })

  it('point d’adresse sur la voirie : repli WFS et parcelle la plus proche', async () => {
    // Réel : API Carto renvoie une collection vide pour le point BAN du n° 12.
    const calls = stubFetch([
      [/apicarto/, EMPTY],
      [/PARCELLAIRE_EXPRESS:parcelle/, { type: 'FeatureCollection', features: [PARCEL_BW0011, PARCEL_BW0010] }],
    ])
    const p = await fetchParcel(center)
    expect(p?.ref).toBe('44109000BW0010')
    expect(calls[1]).toContain('/ext/geopf/wfs/ows?')
  })

  it('MultiPolygon à 2 anneaux : rings[0] est celui qui contient le point', () => {
    const sq = (lon: number, lat: number, h = 0.0001) => [
      [lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h],
    ]
    const A = sq(2.002, 48) // ≈ 150 m à l'est
    const B = sq(2, 48) // contient le point
    const fc = {
      type: 'FeatureCollection' as const,
      features: [
        {
          geometry: { type: 'MultiPolygon', coordinates: [[A], [B]] },
          properties: { idu: 'X1', contenance: 500 },
        },
      ],
    }
    const hit = pickParcel(fc, { lon: 2, lat: 48 }, 0)
    expect(hit?.ref).toBe('X1')
    expect(hit?.rings).toHaveLength(2)
    expect(hit?.rings[0][0]).toEqual({ lon: 1.9999, lat: 47.9999 }) // anneau B en premier
  })

  it('hors parcelle : rings[0] est l’anneau le plus proche', () => {
    const sq = (lon: number, lat: number, h = 0.0001) => [
      [lon - h, lat - h], [lon + h, lat - h], [lon + h, lat + h], [lon - h, lat + h], [lon - h, lat - h],
    ]
    const far = sq(2.01, 48)
    const near = sq(2.0003, 48) // bord à ≈ 14 m
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{ geometry: { type: 'MultiPolygon', coordinates: [[far], [near]] }, properties: { idu: 'X2' } }],
    }
    expect(pickParcel(fc, { lon: 2, lat: 48 }, 30)?.rings[0][0].lon).toBeCloseTo(2.0002, 6)
    expect(pickParcel(fc, { lon: 2, lat: 48 }, 5)).toBeNull()
  })

  it('null si rien à proximité', async () => {
    stubFetch([[/apicarto/, EMPTY], [/wfs/, EMPTY]])
    expect(await fetchParcel(center)).toBeNull()
  })
})

describe('fetchBuildings', () => {
  it('BBOX WFS 2.0 en lat,lon et parse hauteur / étages', async () => {
    const calls = stubFetch([[/BDTOPO_V3:batiment/, BUILDINGS]])
    const b = await fetchBuildings(center, 50)
    expect(b).toHaveLength(2)
    expect(b[0]).toMatchObject({ id: 'BATIMENT0000000303977009', heightM: 8.5 })
    expect(b[0].ring).toHaveLength(5)
    expect(b[0].ring[0]).toEqual({ lon: -1.53097755, lat: 47.22569633 })
    expect(b[1].heightM).toBe(6) // 2 étages × 3 m
    const bbox = new URL(calls[0], 'http://x').searchParams.get('BBOX')!.split(',')
    expect(Number(bbox[0])).toBeCloseTo(47.2252, 3) // lat d'abord
    expect(Number(bbox[1])).toBeCloseTo(-1.5316, 3)
    expect(bbox[4]).toBe('urn:ogc:def:crs:EPSG::4326')
    expect(calls[0]).toContain('COUNT=200')
  })

  it('hauteur par défaut', () => {
    expect(buildingHeight({})).toBe(6)
    expect(buildingHeight({ hauteur: 0, nombre_d_etages: null })).toBe(6)
  })

  it('wfsBbox couvre ± rayon', () => {
    const [s, w, n, e] = wfsBbox(center, 100).split(',').map(Number)
    expect(toLocal(center, { lon: e, lat: n }).x).toBeCloseTo(100, 1)
    expect(toLocal(center, { lon: w, lat: s }).y).toBeCloseTo(-100, 1)
  })
})

describe('terrain', () => {
  it('points sud → nord puis ouest → est', () => {
    const pts = terrainPoints(center, 10, 3)
    expect(pts).toHaveLength(9)
    const l = pts.map((p) => toLocal(center, p))
    expect(l[0].x).toBeCloseTo(-10, 6)
    expect(l[0].y).toBeCloseTo(-10, 6)
    expect(l[1].x).toBeCloseTo(0, 6)
    expect(l[3].y).toBeCloseTo(0, 6)
    expect(l[8].x).toBeCloseTo(10, 6)
    expect(l[8].y).toBeCloseTo(10, 6)
  })

  it('parse la réponse réelle et le -99999', () => {
    // Réel : lon=-3.5|-1.5308&lat=46.5|47.2257 → {"elevations": [-99999.0, 6.9]}
    expect(parseElevations({ elevations: [-99999.0, 6.9] }, 2)).toEqual([null, 6.9])
    expect(() => parseElevations({ elevations: [1] }, 2)).toThrow(/altimétrie/)
  })

  it('interpole les trous', () => {
    expect(fillMissing([1, null, 3, 1, 2, 3, 1, 2, 3], 3)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3])
    expect(fillMissing([null, null, null, null], 2)).toEqual([0, 0, 0, 0])
  })

  it('hauteurs relatives au centre', () => {
    const { grid, altitudeCenterM } = buildTerrain([7, 7.5, 8, null, 7], 5, 2)
    expect(altitudeCenterM).toBe(7)
    expect(grid).toEqual({ size: 5, n: 2, heights: [0, 0.5, 1, 0.75] })
  })

  it('fetchTerrain découpe en lots de 200 points', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        const count = new URL(url, 'http://x').searchParams.get('lon')!.split('|').length
        return new Response(JSON.stringify({ elevations: Array(count).fill(6.84) }), { status: 200 })
      }),
    )
    const { grid, altitudeCenterM } = await fetchTerrain(center, 30, 15) // 225 + centre = 226 points
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('resource=ign_rge_alti_wld')
    expect(calls[0]).toContain('zonly=true')
    expect(altitudeCenterM).toBe(6.84)
    expect(grid.heights).toHaveLength(225)
    expect(grid.heights.every((h) => h === 0)).toBe(true)
  })
})

describe('orthophoto', () => {
  it('BBOX Mercator = carré local × 1/cos(lat)', () => {
    const [minX, minY, maxX, maxY] = orthoBbox(center, 50)
    const k = 1 / Math.cos((center.lat * Math.PI) / 180)
    expect(maxX - minX).toBeCloseTo(100 * k, 2)
    expect(maxY - minY).toBeCloseTo(100 * k, 1)
    const c = toMercator(center)
    expect((minX + maxX) / 2).toBeCloseTo(c.x, 3)
    expect((minY + maxY) / 2).toBeCloseTo(c.y, 1)
  })

  it('URL WMS', () => {
    const url = orthoTextureUrl(center, 50, 512)
    expect(url.startsWith('/ext/geopf/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap')).toBe(true)
    expect(url).toContain('LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:3857')
    expect(url).toContain('WIDTH=512&HEIGHT=512&FORMAT=image/jpeg')
    const bbox = new URL(url, 'http://x').searchParams.get('BBOX')!.split(',').map(Number)
    expect(bbox[0]).toBeCloseTo(-170499.54, 1) // Xc − 50/cos(lat)
    expect(bbox[1]).toBeCloseTo(5978910.7, 0)
  })

  it('bornes : petites emprises valides, px plafonné à 2048', () => {
    for (const h of [15, 30, 100]) {
      const url = orthoTextureUrl(center, h)
      const bbox = new URL(url, 'http://x').searchParams.get('BBOX')!.split(',').map(Number)
      expect(bbox).toHaveLength(4)
      expect(bbox.every(Number.isFinite)).toBe(true)
      expect(bbox[2]).toBeGreaterThan(bbox[0])
      expect(bbox[3]).toBeGreaterThan(bbox[1])
      expect(bbox[2] - bbox[0]).toBeCloseTo((2 * h) / Math.cos((center.lat * Math.PI) / 180), 1)
    }
    expect(orthoTextureUrl(center, 15, 99999)).toContain('WIDTH=2048&HEIGHT=2048')
    expect(orthoTextureUrl(center, 15, 1)).toContain('WIDTH=16&HEIGHT=16')
    expect(orthoTextureUrl(center, 15, NaN)).toContain('WIDTH=1024&HEIGHT=1024')
    expect(orthoTextureUrl(center, 0)).toContain('BBOX=') // emprise nulle : repli à 1 m
    const b = new URL(orthoTextureUrl(center, 0), 'http://x').searchParams.get('BBOX')!.split(',').map(Number)
    expect(b[2]).toBeGreaterThan(b[0])
  })

  it('plan IGN : z19 mesuré (200), z20 non mesuré donc jamais demandé', () => {
    expect(PLAN_MAXZOOM).toBe(19)
    expect(ORTHO_MAXZOOM).toBe(19)
    expect(CADASTRE_MAXZOOM).toBe(18) // maxzoom réel NON vérifié
  })

  it('zooms maximaux exportés', () => {
    for (const z of [ORTHO_MAXZOOM, PLAN_MAXZOOM, CADASTRE_MAXZOOM]) {
      expect(z).toBeGreaterThanOrEqual(18)
      expect(z).toBeLessThanOrEqual(21)
    }
  })
})
