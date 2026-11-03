// Ombres de contact : disques flous posés sur le sol sous les plantes, les arbres des environs et au pied des murs.
// Elles donnent de l'ancrage au sol à très bas coût (un seul appel de dessin, 2 triangles par disque) et complètent
// les ombres du soleil, qui ne sont calculées qu'à la demande et peuvent être grossières à 1024 px.
// Pur : calcule la liste des disques ; ContactShadows.tsx les dessine.
import type { Building, XY } from '../../types'
import type { DetectedTree } from '../../lib/lidar'
import type { PlantVisual } from './plantModel'

/** Un disque posé sur le sol. Repère Three.js : (x, y, z) = centre, y = hauteur du sol ; `sx` le long de l'axe tourné de `rotY`, `sz` en travers. */
export interface ShadowInst {
  x: number
  y: number
  z: number
  sx: number
  sz: number
  rotY: number
}

/** Plafond de disques (mémoire du tampon d'instances). */
export const MAX_CONTACT_SHADOWS = 2400
/** Décalage au-dessus du sol (m) contre le scintillement, en plus du polygonOffset du matériau. */
export const SHADOW_LIFT_M = 0.035
/** Les murs de plus de cette longueur (m) sont découpés ? Non : un seul disque étiré par mur, plus léger. */
const MIN_EDGE_M = 0.6
/** Largeur (m) de l'ombre au pied d'un mur. */
const WALL_WIDTH_M = 1.5

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

function area2(ring: XY[]): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    s += a.x * b.y - b.x * a.y
  }
  return s
}

/** Diamètre (m) du disque d'une plante : un peu moins que son envergure, borné. */
export function plantShadowDiameter(v: Pick<PlantVisual, 'shape' | 'spreadM' | 'heightM'>): number {
  const s = Number.isFinite(v.spreadM) ? v.spreadM : 0.5
  switch (v.shape) {
    case 'tree':
      return clamp(s * 0.8, 0.5, 4)
    case 'shrub':
    case 'climber':
      return clamp(s * 0.95, 0.4, 3)
    default:
      return clamp(s * 1.1, 0.25, 1.4)
  }
}

export interface ContactArgs {
  visuals: Record<string, PlantVisual>
  trees?: DetectedTree[]
  buildings?: Building[]
  sample: (x: number, y: number) => number
  max?: number
}

/**
 * Disques à dessiner : plantes d'abord, puis arbres des environs, puis pieds de murs (bâtiments les plus proches de l'origine du
 * jardin d'abord). Les plantes en projet n'en ont pas. Jamais plus de `max`.
 */
export function contactShadowInstances({ visuals, trees, buildings, sample, max = MAX_CONTACT_SHADOWS }: ContactArgs): ShadowInst[] {
  const out: ShadowInst[] = []
  const push = (x: number, y: number, d1: number, d2: number, rot: number, h?: number) => {
    if (out.length >= max || !Number.isFinite(x + y + d1 + d2 + rot)) return
    out.push({ x, y: (h ?? sample(x, y)) + SHADOW_LIFT_M, z: -y, sx: d1, sz: d2, rotY: rot })
  }
  for (const id in visuals) {
    const v = visuals[id]
    if (!v || v.ghost) continue
    const d = plantShadowDiameter(v)
    push(v.base[0], -v.base[2], d, d, 0, v.base[1])
  }
  for (const t of trees ?? []) {
    if (![t.x, t.y, t.heightM, t.radiusM].every(Number.isFinite)) continue
    const d = clamp(t.radiusM * 1.4, 1.2, 9)
    push(t.x, t.y, d, d, 0)
  }
  const near = [...(buildings ?? [])].filter((b) => b.ring.length >= 3 && b.heightM > 0.3).sort((a, b) => dist0(a.ring) - dist0(b.ring))
  for (const b of near) {
    let ring = b.ring
    const f = ring[0]
    const l = ring[ring.length - 1]
    if (ring.length > 3 && Math.abs(f.x - l.x) < 1e-6 && Math.abs(f.y - l.y) < 1e-6) ring = ring.slice(0, -1)
    const ccw = area2(ring) >= 0
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const c = ring[(i + 1) % ring.length]
      const ex = c.x - a.x
      const ey = c.y - a.y
      const len = Math.hypot(ex, ey)
      if (len < MIN_EDGE_M) continue
      // Normale sortante : à droite de l'arête pour un contour anti-horaire.
      const nx = (ccw ? ey : -ey) / len
      const ny = (ccw ? -ex : ex) / len
      const off = WALL_WIDTH_M * 0.25
      push((a.x + c.x) / 2 + nx * off, (a.y + c.y) / 2 + ny * off, len + WALL_WIDTH_M * 0.6, WALL_WIDTH_M, Math.atan2(ey, ex))
    }
  }
  return out
}

function dist0(ring: XY[]): number {
  let x = 0
  let y = 0
  for (const p of ring) {
    x += p.x
    y += p.y
  }
  return Math.hypot(x / ring.length, y / ring.length)
}
