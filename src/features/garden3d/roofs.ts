// Bâtiments : hauteur issue du LiDAR HD (MNH) quand il est fourni, sinon BD TOPO ; toit à deux pans quand le MNH
// montre un faîtage net sur un contour à peu près rectangulaire, sinon toit plat.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Building, TerrainGrid, XY } from '../../types'
import { pointInRing } from '../../lib/geo'
import { hash } from './plantParts'
import { makeHeightSampler, type HeightSampler } from './terrain'

export interface RoofSpec {
  kind: 'flat' | 'gable'
  /** Hauteur des murs (gouttière) pour un toit à pans ; hauteur totale pour un toit plat (m). */
  eaveM: number
  /** Hauteur du faîtage (m) ; égale à eaveM pour un toit plat. */
  ridgeM: number
  source: 'lidar' | 'bdtopo'
  /** Rectangle orienté du toit à pans : centre, demi-longueur (le long du faîtage), demi-largeur, angle du faîtage (rad). */
  obb?: { cx: number; cy: number; a: number; b: number; angle: number }
}

export function cleanRing(ring: XY[]): XY[] {
  const r = ring.slice()
  if (r.length > 1) {
    const a = r[0]
    const b = r[r.length - 1]
    if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) r.pop()
  }
  return r
}

function ringArea(ring: XY[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

const pct = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]

/** Rectangle orienté dont l'axe suit le plus long côté du contour. */
export function orientedBox(ring: XY[]): { cx: number; cy: number; a: number; b: number; angle: number; fill: number } {
  let best = 0
  let angle = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    const l = Math.hypot(q.x - p.x, q.y - p.y)
    if (l > best) {
      best = l
      angle = Math.atan2(q.y - p.y, q.x - p.x)
    }
  }
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (const p of ring) {
    const u = p.x * c + p.y * s
    const v = -p.x * s + p.y * c
    u0 = Math.min(u0, u)
    u1 = Math.max(u1, u)
    v0 = Math.min(v0, v)
    v1 = Math.max(v1, v)
  }
  let a = (u1 - u0) / 2
  let b = (v1 - v0) / 2
  const um = (u0 + u1) / 2
  const vm = (v0 + v1) / 2
  let ang = angle
  if (b > a) {
    // le faîtage suit le côté le plus long
    ;[a, b] = [b, a]
    ang += Math.PI / 2
  }
  const fill = ringArea(ring) / Math.max(1e-6, 4 * a * b)
  return { cx: um * c - vm * s, cy: um * s + vm * c, a, b, angle: ang, fill }
}

/**
 * Forme du toit d'un bâtiment. Avec une grille MNH (hauteur au-dessus du sol, repère local) : on mesure les hauteurs à l'intérieur
 * du contour (à 0,6 m des bords, pour ne pas lire les arbres voisins). Pas assez de points au-dessus du sol : BD TOPO, toit plat.
 */
export function roofSpecFor(b: Building, canopy: TerrainGrid | undefined, sampler?: HeightSampler): RoofSpec {
  const flat: RoofSpec = { kind: 'flat', eaveM: b.heightM, ridgeM: b.heightM, source: 'bdtopo' }
  const ring = cleanRing(b.ring)
  if (!canopy || ring.length < 3 || canopy.n < 2) return flat
  const sample = sampler ?? makeHeightSampler(canopy)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  // L'emprise du MNH doit couvrir tout le bâtiment.
  if (minX < -canopy.size || maxX > canopy.size || minY < -canopy.size || maxY > canopy.size) return flat
  const step = Math.max(0.75, Math.sqrt(((maxX - minX) * (maxY - minY)) / 300))
  const vals: number[] = []
  const collect = (inset: number) => {
    vals.length = 0
    for (let y = minY + step / 2; y < maxY; y += step) {
      for (let x = minX + step / 2; x < maxX; x += step) {
        const p = { x, y }
        if (!pointInRing(p, ring)) continue
        if (inset > 0) {
          let d = Infinity
          for (let i = 0; i < ring.length; i++) d = Math.min(d, distToSegment(p, ring[i], ring[(i + 1) % ring.length]))
          if (d < inset) continue
        }
        vals.push(sample(x, y))
      }
    }
  }
  collect(0.6)
  if (vals.length < 6) collect(0)
  if (vals.length < 4) return flat
  const raised = vals.filter((v) => v > 1.2)
  // Moins de la moitié du contour au-dessus de 1,2 m : le MNH ne voit pas ce bâtiment (hors couverture, ou trop récent).
  if (raised.length < vals.length * 0.5) return flat
  const sorted = [...raised].sort((p, q) => p - q)
  const median = pct(sorted, 0.5)
  const ridge = pct(sorted, 0.95)
  const eave = pct(sorted, 0.1)
  if (!(ridge >= 2 && ridge <= 45)) return flat
  const box = orientedBox(ring)
  if (ridge - eave >= 1 && box.fill >= 0.8 && ring.length <= 8 && box.b >= 2 && box.b <= 12 && sorted.length >= 12) {
    const e = Math.max(2, eave)
    return { kind: 'gable', eaveM: e, ridgeM: Math.max(e + 0.5, ridge), source: 'lidar', obb: { cx: box.cx, cy: box.cy, a: box.a, b: box.b, angle: box.angle } }
  }
  const h = Math.max(2, median)
  return { kind: 'flat', eaveM: h, ridgeM: h, source: 'lidar' }
}

// ---------- Géométrie ----------

const WALLS = ['#dcd8cf', '#e3dccb', '#d6d2c6', '#e6e1d6'].map((c) => new THREE.Color(c))
const TILES = ['#a4553a', '#9a4e36', '#5d6670', '#6a6460'].map((c) => new THREE.Color(c))
const FLAT_ROOF = new THREE.Color('#8e8e8a')

function addColors(g: THREE.BufferGeometry, pick: (nx: number, ny: number, nz: number, y: number) => THREE.Color, y0: number, h: number) {
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const c = pick(nor.getX(i), nor.getY(i), nor.getZ(i), pos.getY(i))
    // murs un peu plus sombres au pied
    const k = 0.84 + 0.16 * Math.min(1, Math.max(0, (pos.getY(i) - y0) / Math.max(1, h)))
    col[i * 3] = c.r * k
    col[i * 3 + 1] = c.g * k
    col[i * 3 + 2] = c.b * k
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
}

function gableGeometry(spec: RoofSpec, base: number, wall: THREE.Color, tile: THREE.Color): THREE.BufferGeometry {
  const o = spec.obb!
  const dx = Math.cos(o.angle)
  const dy = Math.sin(o.angle)
  const nx = -dy
  const ny = dx
  const over = 0.2
  const a = o.a
  const b = o.b
  const P = (s: number, t: number, h: number): [number, number, number] => [o.cx + s * dx + t * nx, h, -(o.cy + s * dy + t * ny)]
  const z0 = base - 0.3
  const B1 = P(-a, -b, z0)
  const B2 = P(a, -b, z0)
  const B3 = P(a, b, z0)
  const B4 = P(-a, b, z0)
  const E1 = P(-a, -b, spec.eaveM)
  const E2 = P(a, -b, spec.eaveM)
  const E3 = P(a, b, spec.eaveM)
  const E4 = P(-a, b, spec.eaveM)
  // Débord de toit : le toit déborde un peu des murs, au niveau de la gouttière.
  const Q1 = P(-a - over, -b - over, spec.eaveM)
  const Q2 = P(a + over, -b - over, spec.eaveM)
  const Q3 = P(a + over, b + over, spec.eaveM)
  const Q4 = P(-a - over, b + over, spec.eaveM)
  const R1 = P(-a - over, 0, spec.ridgeM)
  const R2 = P(a + over, 0, spec.ridgeM)
  const G1 = P(-a, 0, spec.ridgeM)
  const G2 = P(a, 0, spec.ridgeM)
  const pos: number[] = []
  const col: number[] = []
  const tri = (p: number[][], c: THREE.Color) => {
    for (const v of p) {
      pos.push(v[0], v[1], v[2])
      col.push(c.r, c.g, c.b)
    }
  }
  // Les points sont donnés dans le repère (x, haut, -nord) : même orientation que (x, nord, haut), l'ordre des sommets est conservé.
  tri([B1, B2, E2], wall)
  tri([B1, E2, E1], wall)
  tri([B3, B4, E4], wall)
  tri([B3, E4, E3], wall)
  tri([B4, B1, E1], wall)
  tri([B4, E1, E4], wall)
  tri([E4, E1, G1], wall)
  tri([B2, B3, E3], wall)
  tri([B2, E3, E2], wall)
  tri([E2, E3, G2], wall)
  tri([Q1, Q2, R2], tile)
  tri([Q1, R2, R1], tile)
  tri([Q3, Q4, R1], tile)
  tri([Q3, R1, R2], tile)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

export interface BuildingsGeometry {
  geometry: THREE.BufferGeometry | null
  specs: Record<string, RoofSpec>
  triangles: number
}

/** Tous les bâtiments fusionnés en une seule géométrie colorée (un seul appel de dessin). */
export function buildBuildingsGeometry(buildings: Building[], sample: HeightSampler, canopy?: TerrainGrid): BuildingsGeometry {
  const geos: THREE.BufferGeometry[] = []
  const specs: Record<string, RoofSpec> = {}
  const canopySampler = canopy ? makeHeightSampler(canopy) : undefined
  for (const b of buildings) {
    const ring = cleanRing(b.ring)
    if (ring.length < 3 || !(b.heightM > 0)) continue
    let base = Infinity
    for (const p of ring) base = Math.min(base, sample(p.x, p.y))
    if (!isFinite(base)) base = 0
    const h = hash(b.id)
    const wall = WALLS[Math.floor(h * WALLS.length) % WALLS.length]
    const tile = TILES[Math.floor(hash(b.id + 't') * TILES.length) % TILES.length]
    const spec = roofSpecFor(b, canopy, canopySampler)
    specs[b.id] = spec
    if (spec.kind === 'gable' && spec.obb) {
      geos.push(gableGeometry(spec, base, wall, tile))
      continue
    }
    // Toit plat : forme dans le plan (x = est, y = nord), extrudée selon +Z, puis basculée : Z -> haut, y -> -Z.
    const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.y)))
    const g = new THREE.ExtrudeGeometry(shape, { depth: spec.eaveM + 0.3, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    g.translate(0, base - 0.3, 0)
    const ng = g.index ? g.toNonIndexed() : g
    ng.computeVertexNormals()
    ng.deleteAttribute('uv')
    addColors(ng, (_x, ny) => (ny > 0.5 ? FLAT_ROOF : wall), base - 0.3, spec.eaveM + 0.3)
    geos.push(ng)
  }
  if (!geos.length) return { geometry: null, specs, triangles: 0 }
  const merged = mergeGeometries(geos, false)
  geos.forEach((g) => g.dispose())
  if (!merged) return { geometry: null, specs, triangles: 0 }
  merged.computeVertexNormals()
  merged.computeBoundingSphere()
  return { geometry: merged, specs, triangles: merged.attributes.position.count / 3 }
}
