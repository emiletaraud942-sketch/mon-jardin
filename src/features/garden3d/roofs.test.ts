import { describe, expect, it } from 'vitest'
import type { Building, TerrainGrid } from '../../types'
import { buildBuildingsGeometry, orientedBox, roofSpecFor } from './roofs'
import { flatSampler } from './terrain'

/** MNH synthétique 1 m/pixel sur [-30, 30] : fonction de la position. */
function canopy(f: (x: number, y: number) => number): TerrainGrid {
  const n = 61
  const heights: number[] = []
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) heights.push(f(-30 + j, -30 + i))
  return { size: 30, n, heights }
}
const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]
const house: Building = { id: 'maison', ring: rect(-6, -4, 12, 8), heightM: 5 }
// Toit à deux pans : faîtage le long de x (au milieu en y), gouttière à 5 m, faîtage à 8 m.
const gable = canopy((x, y) => (x >= -6 && x <= 6 && y >= -4 && y <= 4 ? 5 + 3 * (1 - Math.abs(y) / 4) : 0))
const flatRoof = canopy((x, y) => (x >= -6 && x <= 6 && y >= -4 && y <= 4 ? 6.2 : 0))

describe('toits et hauteurs LiDAR', () => {
  it('sans MNH : BD TOPO, toit plat', () => {
    const s = roofSpecFor(house, undefined)
    expect(s).toMatchObject({ kind: 'flat', eaveM: 5, source: 'bdtopo' })
  })
  it('MNH avec faîtage : toit à deux pans, hauteurs mesurées, faîtage le long du grand côté', () => {
    const s = roofSpecFor(house, gable)
    expect(s.kind).toBe('gable')
    expect(s.source).toBe('lidar')
    expect(s.ridgeM).toBeGreaterThan(7.2)
    expect(s.ridgeM).toBeLessThanOrEqual(8.05)
    expect(s.eaveM).toBeGreaterThan(5)
    expect(s.eaveM).toBeLessThan(6.2)
    expect(Math.abs(Math.cos(s.obb!.angle))).toBeGreaterThan(0.99) // le long de x
    expect(s.obb!.a).toBeCloseTo(6, 0)
    expect(s.obb!.b).toBeCloseTo(4, 0)
  })
  it('MNH plat : hauteur LiDAR (6,2 m) à la place de la BD TOPO (5 m), toit plat', () => {
    const s = roofSpecFor(house, flatRoof)
    expect(s.kind).toBe('flat')
    expect(s.source).toBe('lidar')
    expect(s.eaveM).toBeCloseTo(6.2, 1)
  })
  it('MNH vide ou bâtiment hors couverture : BD TOPO', () => {
    expect(roofSpecFor(house, canopy(() => 0)).source).toBe('bdtopo')
    expect(roofSpecFor({ ...house, ring: rect(40, 40, 5, 5) }, gable).source).toBe('bdtopo')
  })
  it('contour en L : pas de toit à pans (toit plat)', () => {
    const L: Building = { id: 'L', heightM: 5, ring: [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 4 }, { x: -6, y: 4 }] }
    const g = canopy((x, y) => (y >= -4 && y <= 4 && x >= -6 && x <= 6 && !(x > 0 && y > 0) ? 5 + 3 * (1 - Math.abs(y) / 4) : 0))
    expect(roofSpecFor(L, g).kind).toBe('flat')
  })
  it('rectangle orienté : angle et remplissage', () => {
    const b = orientedBox(rect(0, 0, 10, 4))
    expect(b.a).toBeCloseTo(5)
    expect(b.b).toBeCloseTo(2)
    expect(b.fill).toBeCloseTo(1)
    const tall = orientedBox(rect(0, 0, 4, 10))
    expect(tall.a).toBeCloseTo(5)
    expect(Math.abs(Math.sin(tall.angle))).toBeGreaterThan(0.99)
  })
  it('géométrie : un seul maillage fusionné, coloré, avec toit à pans plus haut que les murs', () => {
    const r = buildBuildingsGeometry([house, { id: 'abri', ring: rect(10, 10, 3, 3), heightM: 2.4 }], flatSampler, gable)
    expect(r.geometry).toBeTruthy()
    expect(r.geometry!.attributes.color).toBeTruthy()
    expect(r.specs.maison.kind).toBe('gable')
    r.geometry!.computeBoundingBox()
    expect(r.geometry!.boundingBox!.max.y).toBeGreaterThan(7.5)
    expect(r.triangles).toBeGreaterThan(14)
    // sans MNH : plat, hauteur BD TOPO
    const flat = buildBuildingsGeometry([house], flatSampler)
    flat.geometry!.computeBoundingBox()
    expect(flat.geometry!.boundingBox!.max.y).toBeCloseTo(5, 1)
  })
  it('bâtiment sans hauteur ou contour dégénéré : ignoré, sans erreur', () => {
    const r = buildBuildingsGeometry([{ id: 'a', ring: rect(0, 0, 1, 1), heightM: 0 }, { id: 'b', ring: [{ x: 0, y: 0 }], heightM: 5 }], flatSampler)
    expect(r.geometry).toBeNull()
  })
})
