import { describe, expect, it, vi } from 'vitest'
import type { TerrainGrid } from '../types'
import {
  canopyFromSurface,
  canopyFromValues,
  applyMnhHeights,
  buildingHeightFromMnh,
  canopyHeightAt,
  pixelCenterM,
  pixelGridSize,
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

describe('centres des pixels (decodeBil32 → grille)', () => {
  it('le centre du pixel i est −h + (i + ½) · 2h / n', () => {
    expect(pixelCenterM(0, 120, 60)).toBeCloseTo(-59.5, 6) // un demi-pixel du bord, pas sur le bord
    expect(pixelCenterM(119, 120, 60)).toBeCloseTo(59.5, 6)
    expect(pixelCenterM(0, 4, 2)).toBeCloseTo(-1.5, 6)
    expect(pixelCenterM(3, 4, 2)).toBeCloseTo(1.5, 6)
  })
  it('les nœuds de la grille tombent sur les centres des pixels (écart de 0,5 m corrigé au bord)', () => {
    const n = 6
    const h = 3 // 1 m par pixel
    const raw = bil(n, (_r, c) => 100 + c) // la valeur dit la colonne ; nord en premier
    const g = canopyFromValues(decodeBil32(raw, n), n, h)
    expect(g.size).toBeCloseTo(pixelGridSize(h, n), 9)
    expect(g.size).toBeCloseTo(2.5, 9)
    const step = (2 * g.size) / (g.n - 1)
    for (let i = 0; i < n; i++) {
      const nodeX = -g.size + i * step
      expect(nodeX).toBeCloseTo(pixelCenterM(i, n, h), 9)
      // La mesure du pixel i se relit à son centre réel (interpolation exacte sur un nœud).
      expect(canopyHeightAt(g, { x: nodeX, y: 0 })).toBeCloseTo(100 + i, 3)
    }
    // Ancienne convention (nœuds sur [-h, +h]) : la colonne 0 aurait été lue à −3 m au lieu de −2,5 m.
    expect(canopyHeightAt(g, { x: -2.5, y: 0 })).toBeCloseTo(100, 6)
    expect(canopyHeightAt(g, { x: -3, y: 0 })).toBeCloseTo(100, 6) // le demi-pixel du bord reste couvert
    expect(canopyHeightAt(g, { x: -3.2, y: 0 })).toBe(0)
  })
  it('le pas de la grille est celui du raster (2h / n)', () => {
    const t = terrainFromMnt(new Array(120 * 120).fill(10), 120, 60)
    expect((2 * t.grid.size) / (t.grid.n - 1)).toBeCloseTo(1, 9)
  })
})

describe('hauteur des bâtiments d’après le MNH', () => {
  // Grille 1 m par pixel : toit à 8 m sur [-5,5]×[-5,5], arbre de 14 m collé à la façade est (x ∈ [4,5], y ∈ [-5,-3]).
  const n = 41
  const roof = (x: number, y: number) => (Math.abs(x) <= 5 && Math.abs(y) <= 5 ? 8 : 0)
  const canopy: TerrainGrid = (() => {
    const size = (n - 1) / 2
    const heights: number[] = []
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = -size + i
        const y = -size + j
        heights.push(x >= 4 && x <= 5 && y >= -5 && y <= -3 ? 14 : roof(x, y))
      }
    return { size, n, heights }
  })()
  const ring = [{ x: -5, y: -5 }, { x: 5, y: -5 }, { x: 5, y: 5 }, { x: -5, y: 5 }]

  it('90e centile dans l’emprise', () => {
    const flat: TerrainGrid = { ...canopy, heights: canopy.heights.map((_, k) => roof(-20 + (k % n), -20 + Math.floor(k / n))) }
    expect(buildingHeightFromMnh(flat, ring)).toBeCloseTo(8, 1)
  })
  it('un arbre collé à la façade ne fait pas monter le toit (plafond : double de la médiane)', () => {
    const h = buildingHeightFromMnh(canopy, ring) as number
    expect(h).toBeGreaterThanOrEqual(7.9)
    expect(h).toBeLessThanOrEqual(16) // jamais au-delà de 2 × 8
    // Sans ce plafond, un bâtiment bas dont la moitié est couverte par un grand arbre prendrait la hauteur de l’arbre.
    const lowRoof: TerrainGrid = { ...canopy, heights: canopy.heights.map((v) => (v === 8 ? 3 : v === 14 ? 30 : v)) }
    expect(buildingHeightFromMnh(lowRoof, ring) as number).toBeLessThanOrEqual(6)
  })
  it('repli (null) : hors de la grille, trop peu de points, MNH vide', () => {
    expect(buildingHeightFromMnh(canopy, ring.map((p) => ({ x: p.x + 100, y: p.y })))).toBeNull()
    expect(buildingHeightFromMnh(canopy, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeNull()
    expect(buildingHeightFromMnh(canopy, [{ x: 0, y: 0 }, { x: 0.8, y: 0 }, { x: 0.4, y: 0.8 }])).toBeNull()
    const empty: TerrainGrid = { ...canopy, heights: canopy.heights.map(() => 0) }
    expect(buildingHeightFromMnh(empty, ring)).toBeNull()
  })
  it('applyMnhHeights : seulement les bâtiments sans hauteur ; 6 m gardés si la mesure manque', () => {
    const far = ring.map((p) => ({ x: p.x + 100, y: p.y }))
    const input = [
      { id: 'a', ring, heightM: 6 },
      { id: 'b', ring, heightM: 9 }, // hauteur connue de la BD TOPO : intacte
      { id: 'c', ring: far, heightM: 6 },
    ]
    const out = applyMnhHeights(input, new Set(['a', 'c']), canopy)
    expect(out[0].heightM).toBeGreaterThan(7)
    expect(out[0].heightM).not.toBe(6)
    expect(out[1]).toBe(input[1])
    expect(out[2].heightM).toBe(6)
    expect(Object.keys(out[0]).sort()).toEqual(['heightM', 'id', 'ring']) // format stocké inchangé
  })
})
