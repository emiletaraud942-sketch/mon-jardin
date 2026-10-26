// Accrochage magnétique et règle de distances pour le placement d'une plante. Pur, sans DOM.
// Repère de src/lib/geo.ts : mètres locaux, x = est, y = nord.
import type { XY } from '../types'

export type SnapKind = 'limite' | 'facade' | 'plante' | 'rang' | 'espacement'
export type GuideKind = SnapKind | 'alignement'

export interface SnapGuide {
  kind: GuideKind
  from: XY
  to: XY
}

export interface Segment {
  a: XY
  b: XY
}

export interface SnapTargets {
  /** Limites du terrain (anneau de la parcelle). */
  parcel?: XY[]
  /** Façades : un anneau par bâtiment. */
  buildings?: XY[][]
  /** Autres plantes (positions). */
  plants?: XY[]
  /** Rangs : droites (infinies) définies par deux points. */
  rows?: Segment[]
}

export interface SnapResult {
  point: XY
  guides: SnapGuide[]
  snappedTo?: SnapKind
}

const EPS = 1e-9
/** Un repère qui fixe les deux axes l'emporte sur un repère qui n'en fixe qu'un, à écart voisin. */
const POINT_BONUS = 0.4
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y)

/** Mètres par pixel d'écran pour une carte MapLibre (tuiles de 512 px) à cette latitude et ce zoom. */
export function metersPerPixel(zoom: number, latDeg: number): number {
  return (40075016.686 * Math.cos((latDeg * Math.PI) / 180)) / (512 * Math.pow(2, zoom))
}

/** Seuil d'accrochage (m) pour un nombre de pixels donné. */
export const thresholdMeters = (px: number, zoom: number, latDeg: number) => px * metersPerPixel(zoom, latDeg)

function ringEdges(ring: XY[]): Segment[] {
  const out: Segment[] = []
  if (ring.length < 2) return out
  for (let i = 0; i < ring.length; i++) out.push({ a: ring[i], b: ring[(i + 1) % ring.length] })
  return out
}

/** Point le plus proche de `p` sur le segment [a, b]. */
export function closestOnSegment(p: XY, s: Segment, infinite = false): XY {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const len2 = dx * dx + dy * dy
  if (len2 < EPS) return { x: s.a.x, y: s.a.y }
  let t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2
  if (!infinite) t = Math.max(0, Math.min(1, t))
  return { x: s.a.x + t * dx, y: s.a.y + t * dy }
}

/** Point le plus proche sur le bord d'un anneau. */
export function closestOnRing(p: XY, ring: XY[]): { point: XY; distM: number } | undefined {
  let best: { point: XY; distM: number } | undefined
  for (const e of ringEdges(ring)) {
    const q = closestOnSegment(p, e)
    const d = dist(p, q)
    if (!best || d < best.distM) best = { point: q, distM: d }
  }
  return best
}

interface Candidate {
  point: XY
  disp: number
  guides: SnapGuide[]
  snappedTo: SnapKind
}

/**
 * Rangs détectés : droites passant par au moins 3 plantes alignées (écart ≤ tolM).
 * Au plus 40 plantes examinées (les plus proches de `near`, si fourni).
 */
export function detectRows(plants: XY[], opts: { near?: XY; tolM?: number; max?: number } = {}): Segment[] {
  const tol = opts.tolM ?? 0.15
  let pts = plants.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  const max = opts.max ?? 40
  const near = opts.near
  if (near && pts.length > max) pts = [...pts].sort((p, q) => dist(p, near) - dist(q, near)).slice(0, max)
  else pts = pts.slice(0, max)
  const rows: Segment[] = []
  const seen = new Set<string>()
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i]
      const b = pts[j]
      if (dist(a, b) < 0.3) continue
      const on: number[] = []
      for (let k = 0; k < pts.length; k++) {
        const q = closestOnSegment(pts[k], { a, b }, true)
        if (dist(q, pts[k]) <= tol) on.push(k)
      }
      if (on.length < 3) continue
      const key = on.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      // Extrémités réelles du rang : les deux plantes les plus éloignées.
      let best: Segment = { a, b }
      let bd = 0
      for (const k of on) for (const l of on) if (k < l && dist(pts[k], pts[l]) > bd) { bd = dist(pts[k], pts[l]); best = { a: pts[k], b: pts[l] } }
      rows.push(best)
    }
  }
  return rows
}

/**
 * Accroche `p` au plus proche des repères, s'il y en a à moins de `thresholdM`.
 * Ordre : coin ou plante exacte, alignement sur deux plantes (x et y), limite ou façade, rang, alignement simple, espacement régulier.
 * Sans repère à portée, renvoie `p` tel quel.
 */
export function snapPoint(p: XY, targets: SnapTargets, thresholdM: number): SnapResult {
  const none: SnapResult = { point: p, guides: [] }
  if (!(thresholdM > 0) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return none
  const cands: Candidate[] = []
  const plants = (targets.plants ?? []).filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y))

  // Limites et façades : projection sur le bord le plus proche, ou sur un coin.
  const edgeSets: [SnapKind, XY[][]][] = [
    ['limite', targets.parcel && targets.parcel.length >= 2 ? [targets.parcel] : []],
    ['facade', targets.buildings ?? []],
  ]
  for (const [kind, rings] of edgeSets) {
    let bestEdge: { q: XY; d: number; e: Segment } | undefined
    for (const ring of rings) {
      for (const e of ringEdges(ring)) {
        const q = closestOnSegment(p, e)
        const d = dist(p, q)
        if (d <= thresholdM && (!bestEdge || d < bestEdge.d)) bestEdge = { q, d, e }
      }
    }
    if (bestEdge) cands.push({ point: bestEdge.q, disp: bestEdge.d, snappedTo: kind, guides: [{ kind, from: bestEdge.e.a, to: bestEdge.e.b }] })
  }

  // Rangs : projection sur la droite.
  for (const r of targets.rows ?? []) {
    const q = closestOnSegment(p, r, true)
    const d = dist(p, q)
    if (d <= thresholdM) cands.push({ point: q, disp: d, snappedTo: 'rang', guides: [{ kind: 'rang', from: r.a, to: r.b }] })
  }

  // Alignement sur x ou y d'une autre plante.
  let bx: { q: XY; d: number } | undefined
  let by: { q: XY; d: number } | undefined
  for (const q of plants) {
    const dx = Math.abs(p.x - q.x)
    const dy = Math.abs(p.y - q.y)
    if (dx <= thresholdM && (!bx || dx < bx.d)) bx = { q, d: dx }
    if (dy <= thresholdM && (!by || dy < by.d)) by = { q, d: dy }
  }
  if (bx && by) {
    const pt = { x: bx.q.x, y: by.q.y }
    cands.push({
      point: pt,
      disp: dist(p, pt) * POINT_BONUS,
      snappedTo: 'plante',
      guides: [
        { kind: 'alignement', from: bx.q, to: pt },
        { kind: 'alignement', from: by.q, to: pt },
      ],
    })
  }
  if (bx) {
    const pt = { x: bx.q.x, y: p.y }
    cands.push({ point: pt, disp: bx.d, snappedTo: 'plante', guides: [{ kind: 'alignement', from: bx.q, to: pt }] })
  }
  if (by) {
    const pt = { x: p.x, y: by.q.y }
    cands.push({ point: pt, disp: by.d, snappedTo: 'plante', guides: [{ kind: 'alignement', from: by.q, to: pt }] })
  }

  // Distance régulière : prolonge l'écart entre deux plantes voisines (les 6 plus proches).
  const near = [...plants].sort((a, b) => dist(a, p) - dist(b, p)).slice(0, 6)
  for (let i = 0; i < near.length; i++) {
    for (let j = 0; j < near.length; j++) {
      if (i === j) continue
      const a = near[i]
      const b = near[j]
      if (dist(a, b) < 0.3) continue
      const pt = { x: b.x + (b.x - a.x), y: b.y + (b.y - a.y) }
      const d = dist(p, pt)
      if (d <= thresholdM) cands.push({ point: pt, disp: d * POINT_BONUS, snappedTo: 'espacement', guides: [{ kind: 'espacement', from: a, to: pt }] })
    }
  }

  // Coins de la parcelle et des bâtiments : prioritaires s'ils sont à portée (le point tombe exactement dessus).
  const corners: [SnapKind, XY][] = [
    ...(targets.parcel ?? []).map((c): [SnapKind, XY] => ['limite', c]),
    ...(targets.buildings ?? []).flatMap((r) => r.map((c): [SnapKind, XY] => ['facade', c])),
  ]
  for (const [kind, c] of corners) {
    const d = dist(p, c)
    if (d <= thresholdM * 0.6) cands.push({ point: c, disp: d * 0.5, snappedTo: kind, guides: [{ kind, from: c, to: c }] })
  }

  if (!cands.length) return none
  // Un alignement sur deux plantes (x et y) vaut mieux qu'un alignement simple de même écart.
  const best = cands.reduce((m, c) => (c.disp < m.disp - 1e-9 ? c : m))
  return { point: best.point, guides: best.guides, snappedTo: best.snappedTo }
}

export interface Ruler {
  kind: 'limite' | 'voisine' | 'batiment'
  distM: number
  from: XY
  to: XY
  /** Pour la limite : plante sous la distance légale (art. 671). */
  tooClose?: boolean
}

/** Distances affichées pendant le placement : limite la plus proche, 2 voisines les plus proches, bâtiment le plus proche. */
export function measureRuler(p: XY, ctx: { parcel?: XY[]; buildings?: XY[][]; plants?: XY[]; legalM?: number }): Ruler[] {
  const out: Ruler[] = []
  if (ctx.parcel && ctx.parcel.length >= 3) {
    const c = closestOnRing(p, ctx.parcel)
    if (c) out.push({ kind: 'limite', distM: c.distM, from: p, to: c.point, tooClose: ctx.legalM !== undefined && c.distM < ctx.legalM })
  }
  let bb: { point: XY; distM: number } | undefined
  for (const r of ctx.buildings ?? []) {
    const c = closestOnRing(p, r)
    if (c && (!bb || c.distM < bb.distM)) bb = c
  }
  if (bb) out.push({ kind: 'batiment', distM: bb.distM, from: p, to: bb.point })
  const nb = (ctx.plants ?? [])
    .map((q) => ({ q, d: dist(p, q) }))
    .filter((x) => x.d > 0.05)
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
  for (const x of nb) out.push({ kind: 'voisine', distM: x.d, from: p, to: x.q })
  return out
}

/** Lignes de grille (mètres locaux) qui couvrent le cadre, tous les `stepM`. Au plus `max` lignes par sens. */
export function gridLines(min: XY, max: XY, stepM: number, maxLines = 120): Segment[] {
  if (!(stepM > 0)) return []
  const out: Segment[] = []
  const x0 = Math.ceil(min.x / stepM)
  const x1 = Math.floor(max.x / stepM)
  const y0 = Math.ceil(min.y / stepM)
  const y1 = Math.floor(max.y / stepM)
  if (x1 - x0 + 1 > maxLines || y1 - y0 + 1 > maxLines) return []
  for (let i = x0; i <= x1; i++) out.push({ a: { x: i * stepM, y: min.y }, b: { x: i * stepM, y: max.y } })
  for (let j = y0; j <= y1; j++) out.push({ a: { x: min.x, y: j * stepM }, b: { x: max.x, y: j * stepM } })
  return out
}

/** Rayon (m) du cercle d'incertitude d'une plante scannée : 1 à 2 m selon le recalage, 3 m sans recalage. */
export function uncertaintyRadiusM(rmsM?: number): number {
  if (rmsM === undefined || !Number.isFinite(rmsM)) return 3
  return Math.max(1, Math.min(2, rmsM))
}
