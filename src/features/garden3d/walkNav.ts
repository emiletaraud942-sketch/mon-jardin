// Navigation de la Promenade : liste « Aller à », mini-carte cliquable, lecture vocale de ce qu'on a devant soi,
// préférence « Mouvement réduit ». Fonctions pures et testées (repère local : x = est, y = nord, en mètres).
import type { XY } from '../../types'
import type { Bounds } from './framing'
import { forwardOf, poseNearPlant } from './walk'

// ---------- Mini-carte : projection ----------

export interface MiniProjection {
  /** Mètres -> pixels (nord en haut). */
  toPx: (p: XY) => [number, number]
  /** Pixels -> mètres ; null hors du disque de la carte. */
  fromPx: (x: number, y: number) => XY | null
  /** Pixels par mètre. */
  scale: number
}

/** Projection de la mini-carte ronde de diamètre `size` (px) centrée sur l'emprise du jardin. */
export function minimapProjection(bounds: Bounds, size: number): MiniProjection {
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const worldR = Math.max(10, 0.5 * Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 1.1)
  const scale = (size / 2 - 6) / worldR
  return {
    scale,
    toPx: (p) => [size / 2 + (p.x - cx) * scale, size / 2 - (p.y - cy) * scale],
    fromPx: (x, y) => {
      const dx = x - size / 2
      const dy = y - size / 2
      if (Math.hypot(dx, dy) > size / 2 - 2) return null
      return { x: cx + dx / scale, y: cy - dy / scale }
    },
  }
}

// ---------- Aller à ----------

export interface GotoItem {
  kind: 'plante' | 'photo'
  id: string
  label: string
  /** Distance (m) depuis le promeneur au moment d'ouvrir la liste. */
  distM: number
  /** Où se placer et quoi regarder. */
  stand: XY
  look?: XY
}

const km = (d: number) => (d < 10 ? `${Math.round(d)} m` : `${Math.round(d / 5) * 5} m`)
export const formatDistance = km

/**
 * Destinations proposées : les points de photos du jardin (tous, ils sont 6 au plus) puis les `maxPlants` plantes les plus proches.
 * Pour une plante : se placer à 3 m, du côté du promeneur, en la regardant. Pour un point photo : s'y placer.
 */
export function gotoItems(
  from: XY,
  plants: { id: string; label: string; x: number; y: number }[],
  points: { id: string; label: string; x: number; y: number }[],
  maxPlants = 8,
): GotoItem[] {
  const d = (p: XY) => Math.hypot(p.x - from.x, p.y - from.y)
  const photos: GotoItem[] = points
    .filter((p) => Number.isFinite(p.x + p.y))
    .map((p) => ({ kind: 'photo' as const, id: p.id, label: p.label, distM: d(p), stand: { x: p.x, y: p.y } }))
    .sort((a, b) => a.distM - b.distM)
  const near: GotoItem[] = plants
    .filter((p) => Number.isFinite(p.x + p.y))
    .map((p) => ({ p, dist: d(p) }))
    .sort((a, b) => a.dist - b.dist || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, maxPlants)
    .map(({ p, dist }) => {
      const pose = poseNearPlant({ x: p.x, y: p.y }, from, 3)
      return { kind: 'plante' as const, id: p.id, label: p.label, distM: dist, stand: { x: pose.x, y: pose.y }, look: { x: p.x, y: p.y } }
    })
  return [...photos, ...near]
}

// ---------- Lecture vocale ----------

export interface AheadTarget {
  id: string
  label: string
  x: number
  y: number
}
export interface Ahead {
  id: string
  label: string
  distM: number
}

/** La plante la plus proche dans un cône de ±`halfAngleRad` devant le promeneur, à moins de `rangeM`. */
export function describeAhead(eye: XY, yaw: number, targets: AheadTarget[], opts: { rangeM?: number; halfAngleRad?: number } = {}): Ahead | undefined {
  const range = opts.rangeM ?? 15
  const cosLim = Math.cos(opts.halfAngleRad ?? 0.5)
  const f = forwardOf(yaw)
  let best: Ahead | undefined
  for (const t of targets) {
    const dx = t.x - eye.x
    const dy = t.y - eye.y
    const d = Math.hypot(dx, dy)
    if (d > range || d < 1e-6) continue
    if ((dx * f.x + dy * f.y) / d < cosLim) continue
    if (!best || d < best.distM) best = { id: t.id, label: t.label, distM: d }
  }
  return best
}

/** « devant vous, à 3 m : Pommier » (ou « devant vous, tout près : Pommier » sous 1,5 m). */
export function formatAhead(a: Ahead): string {
  const where = a.distM < 1.5 ? 'tout près' : `à ${Math.max(2, Math.round(a.distM))} m`
  return `devant vous, ${where} : ${a.label}`
}

/**
 * Limite le débit des annonces : au plus une toutes les `minIntervalMs`, et jamais deux fois le même texte de suite.
 * `next(undefined)` (rien devant) oublie le dernier texte : on réannonce la plante quand on la regarde de nouveau.
 */
export function createAnnouncer(minIntervalMs = 2000) {
  let lastText = ''
  let lastAt = -Infinity
  return {
    next(text: string | undefined, nowMs: number): string | undefined {
      if (!text) {
        lastText = ''
        return undefined
      }
      if (text === lastText) return undefined
      if (nowMs - lastAt < minIntervalMs) return undefined
      lastText = text
      lastAt = nowMs
      return text
    },
  }
}

// ---------- Préférences ----------

export const HOP_PREF_KEY = 'pj.walkHop'
export const HELP_SEEN_KEY = 'pj.walkHelpSeen'

/** Mouvement réduit : le choix enregistré, sinon la préférence du système (prefers-reduced-motion). */
export function parseHopPref(raw: string | null | undefined, systemReduced: boolean): boolean {
  if (raw === '1') return true
  if (raw === '0') return false
  return systemReduced
}
