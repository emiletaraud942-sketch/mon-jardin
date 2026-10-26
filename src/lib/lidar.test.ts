import { describe, expect, it, vi } from 'vitest'
import type { TerrainGrid } from '../types'
import {
  canopyFromSurface,
  canopyFromValues,
  canopyHeightAt,
  decodeBil32,
  detectTrees,
  fetchLidar,
  filterTrees,
  isFreshEntry,
  lidarCacheKey,
  lidarPixels,
  lidarUrl,
  terrainFromMnt,
} from './lidar'

const CENTER = { lat: 47.2184, lon: -1.5536 }

/** Grille synthétique n×n (1 m/pixel, demi-côté n/2) avec des disques de hauteur donnée. */
function synthetic(n: number, discs: { cx: number; cy: number; r: number; h: number }[]): TerrainGrid {
  const size = (n - 1) / 2
  const heights: number[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -size + i
      const y = -size + j
      let h = 0.1
      for (const d of discs) if (Math.hypot(x - d.cx, y - d.cy) <= d.r) h = Math.max(h, d.h)
      heights.push(h)
    }
  }
  return { size, n, heights }
}

function bil(n: number, f: (row: number, col: number) => number): ArrayBuffer {
  const buf = new ArrayBuffer(n * n * 4)
  const v = new DataView(buf)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) v.setFloat32((r * n + c) * 4, f(r, c), true)
  return buf
}

describe('lidarUrl', () => {
  it('passe par le proxy wms-r en EPSG:3857, 1 m par pixel', () => {
    const u = lidarUrl('mnh', CENTER, 60)
    expect(u.startsWith('/ext/geopf/wms-r?')).toBe(true)
    expect(u).toContain('LAYERS=IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE')
    expect(u).toContain('CRS=EPSG:3857')
    expect(u).toContain('WIDTH=120&HEIGHT=120')
    expect(u).toContain('image%2Fx-bil')
    expect(lidarPixels(5000)).toBe(512)
  })
})

describe('decodeBil32', () => {
  it('retourne les lignes (nord en premier → sud en premier) et marque le vide', () => {
    const out = decodeBil32(bil(3, (r, c) => (r === 0 && c === 0 ? -99999 : r * 10 + c)), 3)
    expect(out[2 * 3 + 1]).toBe(1) // ligne nord (r=0) en dernier
    expect(out[2 * 3 + 0]).toBeNull()
    expect(out[0]).toBe(20) // ligne sud (r=2)
  })
  it('refuse une réponse de mauvaise taille (erreur XML, hors couverture)', () => {
    const xml = new TextEncoder().encode('<ServiceExceptionReport/>').buffer as ArrayBuffer
    expect(() => decodeBil32(xml, 3)).toThrow(/pas encore disponible/)
  })
})

describe('grilles', () => {
  it('canopée : négatif → 0, trop de vide → refus', () => {
    expect(canopyFromValues([-1, 3, null, 2], 2, 1).heights).toEqual([0, 3, 0, 2])
    expect(() => canopyFromValues([null, null, null, 1], 2, 1)).toThrow()
  })
  it('MNH = MNS - MNT', () => {
    expect(canopyFromSurface([10, 12, 5, 5], [8, 8, 5, 5], 2, 1).heights).toEqual([2, 4, 0, 0])
  })
  it('relief relatif au centre', () => {
    const t = terrainFromMnt([100, 100, 100, 100, 102, 100, 100, 100, 100], 3, 1)
    expect(t.altitudeCenterM).toBeCloseTo(102 - 0, 0) // centre = pixel 4
    expect(t.grid.heights[4]).toBeCloseTo(0, 1)
    expect(t.grid.heights[0]).toBeCloseTo(-2, 1)
  })
  it('canopyHeightAt : interpole et vaut 0 hors grille', () => {
    const g = synthetic(21, [{ cx: 0, cy: 0, r: 3, h: 10 }])
    expect(canopyHeightAt(g, { x: 0, y: 0 })).toBeCloseTo(10, 1)
    expect(canopyHeightAt(g, { x: 500, y: 0 })).toBe(0)
  })
})

describe('detectTrees', () => {
  it('trouve deux arbres, ignore le sol bas et les micro-blobs', () => {
    const g = synthetic(81, [
      { cx: -20, cy: 10, r: 4, h: 12 },
      { cx: 15, cy: -15, r: 2, h: 6 },
      { cx: 0, cy: 0, r: 0.4, h: 9 }, // un pixel : < 2 m²
    ])
    const t = detectTrees(g)
    expect(t).toHaveLength(2)
    expect(t[0].x).toBeCloseTo(-20, 0)
    expect(t[0].y).toBeCloseTo(10, 0)
    expect(t[0].heightM).toBe(12)
    expect(t[0].radiusM).toBeGreaterThan(3.3)
    expect(t[0].radiusM).toBeLessThan(4.8)
    expect(t[1].heightM).toBe(6)
  })
  it('seuil de 2 m, grille vide ou aberrante', () => {
    expect(detectTrees(synthetic(41, [{ cx: 0, cy: 0, r: 3, h: 1.5 }]))).toHaveLength(0)
    expect(detectTrees({ size: 0, n: 1, heights: [5] })).toEqual([])
    expect(detectTrees(synthetic(41, [{ cx: 0, cy: 0, r: 3, h: 120 }]))).toHaveLength(0)
  })
  it('filterTrees écarte bâtiments et plantes déjà connues', () => {
    const trees = [
      { x: 0, y: 0, heightM: 8, radiusM: 3 },
      { x: 20, y: 0, heightM: 8, radiusM: 3 },
      { x: -20, y: 0, heightM: 8, radiusM: 3 },
    ]
    const ring = [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }]
    const out = filterTrees(trees, { buildingRings: [ring], plantPositions: [{ x: 20.5, y: 0 }] })
    expect(out).toEqual([trees[2]])
  })
})

describe('cache', () => {
  it('clé stable et fraîcheur', () => {
    expect(lidarCacheKey(CENTER, 60)).toBe('lidar:47.2184,-1.5536,60')
    const data = { canopy: { size: 1, n: 2, heights: [0, 0, 0, 0] }, trees: [] }
    expect(isFreshEntry({ v: 1, at: 1000, data }, 2000)).toBe(true)
    expect(isFreshEntry({ v: 1, at: 1000, data }, 1000 + 91 * 24 * 3600 * 1000)).toBe(false)
    expect(isFreshEntry({ v: 0, at: 1000, data }, 2000)).toBe(false)
    expect(isFreshEntry(null)).toBe(false)
  })
})

describe('fetchLidar (fetch mocké)', () => {
  it('replie sur null avec un message simple si le service échoue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    const warn = vi.fn()
    expect(await fetchLidar({ lat: 1.1111, lon: 2.2222 }, { halfSizeM: 10, onWarning: warn })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).not.toMatch(/500|HTTP/)
    expect(warn.mock.calls[0][1]).toMatch(/500/)
    vi.unstubAllGlobals()
  })
  it('décode canopée + relief et détecte un arbre', async () => {
    const n = lidarPixels(15) // 30
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        const mnh = url.includes('MNH')
        // arbre au centre-nord ; lignes du nord en premier
        const b = bil(n, (r, c) => (mnh ? (Math.hypot(r - 8, c - 15) < 3 ? 9 : 0) : 50))
        return new Response(b, { status: 200 })
      }),
    )
    const d = await fetchLidar({ lat: 3.3333, lon: 4.4444 }, { halfSizeM: 15 })
    expect(calls).toHaveLength(2)
    expect(d?.trees).toHaveLength(1)
    expect(d?.trees[0].heightM).toBe(9)
    expect(d?.trees[0].y).toBeGreaterThan(3) // au nord
    expect(d?.altitudeCenterM).toBe(50)
    vi.unstubAllGlobals()
  })
})
