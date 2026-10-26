import { applyCalibration, headingToOffset, type Calibration } from '../../lib/calibration'
import type { XY } from '../../types'

// Journal de marche d'un scan en filmant : positions GPS et caps horodatés, interpolés à l'instant de chaque image (pur, testé).

export interface TrackPoint {
  /** Instant du relevé (ms, Date.now()). */
  t: number
  x: number
  y: number
  accuracy: number
}

export interface HeadingPoint {
  t: number
  /** Cap de l'arrière du téléphone, en degrés (0 = nord). */
  deg: number
}

/** Au-delà de cet écart sans relevé autour de l'instant demandé, on ne devine pas la position (ms). */
export const MAX_GAP_MS = 6000

/** Position à l'instant `t` : interpolation entre les deux relevés voisins ; au bord, le plus proche s'il est assez près. */
export function interpolateTrack(track: TrackPoint[], t: number, maxGapMs = MAX_GAP_MS): { x: number; y: number; accuracy: number } | undefined {
  const pts = track.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.t - b.t)
  if (pts.length === 0) return undefined
  if (t <= pts[0].t) return pts[0].t - t <= maxGapMs ? { x: pts[0].x, y: pts[0].y, accuracy: pts[0].accuracy } : undefined
  const last = pts[pts.length - 1]
  if (t >= last.t) return t - last.t <= maxGapMs ? { x: last.x, y: last.y, accuracy: last.accuracy } : undefined
  let i = 0
  while (pts[i + 1].t < t) i++
  const a = pts[i]
  const b = pts[i + 1]
  if (b.t - a.t > maxGapMs * 2) {
    // Trou dans le journal : on prend le relevé le plus proche s'il est assez près.
    const n = t - a.t <= b.t - t ? a : b
    return Math.abs(n.t - t) <= maxGapMs ? { x: n.x, y: n.y, accuracy: n.accuracy } : undefined
  }
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, accuracy: Math.max(a.accuracy, b.accuracy) }
}

/** Écart signé le plus court entre deux caps (degrés, −180 à 180). */
const arc = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180

/** Cap à l'instant `t`, interpolé par le plus court arc (359° → 1° passe par 0°). */
export function interpolateHeading(heads: HeadingPoint[], t: number, maxGapMs = MAX_GAP_MS): number | undefined {
  const pts = heads.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.deg)).sort((a, b) => a.t - b.t)
  if (pts.length === 0) return undefined
  if (t <= pts[0].t) return pts[0].t - t <= maxGapMs ? (pts[0].deg + 360) % 360 : undefined
  const last = pts[pts.length - 1]
  if (t >= last.t) return t - last.t <= maxGapMs ? (last.deg + 360) % 360 : undefined
  let i = 0
  while (pts[i + 1].t < t) i++
  const a = pts[i]
  const b = pts[i + 1]
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  return (((a.deg + arc(a.deg, b.deg) * k) % 360) + 360) % 360
}

/**
 * Cap de l'arrière d'un téléphone tenu droit, d'après `deviceorientationabsolute` (formule du W3C).
 * Donne la direction que regarde la caméra, pas celle du haut de l'écran.
 */
export function cameraHeading(alpha: number, beta: number, gamma: number): number | undefined {
  if (![alpha, beta, gamma].every(Number.isFinite)) return undefined
  const r = Math.PI / 180
  const x = beta * r
  const y = gamma * r
  const z = alpha * r
  const vx = -Math.cos(z) * Math.sin(y) - Math.sin(z) * Math.sin(x) * Math.cos(y)
  const vy = -Math.sin(z) * Math.sin(y) + Math.cos(z) * Math.sin(x) * Math.cos(y)
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) return undefined
  let h = Math.atan2(vx, vy)
  if (h < 0) h += 2 * Math.PI
  return (h / r) % 360
}

export const DEFAULT_DISTANCE_M = 3

export interface FramePosition {
  position: XY
  accuracyM: number
  /** Vrai si un cap a servi à décaler la plante devant la personne. */
  aimed: boolean
}

/**
 * Position d'une image : journal interpolé à son instant, recalage, puis décalage « la plante est à N m devant moi ».
 * Sans journal à cet instant : `undefined` (placement à la main).
 */
export function positionForFrame(t: number, track: TrackPoint[], heads: HeadingPoint[], calibration: Calibration | null | undefined, distanceM = DEFAULT_DISTANCE_M): FramePosition | undefined {
  const p = interpolateTrack(track, t)
  if (!p) return undefined
  const base = applyCalibration(calibration, { x: p.x, y: p.y })
  const h = interpolateHeading(heads, t)
  const d = h !== undefined && distanceM > 0 ? headingToOffset(h, distanceM) : { x: 0, y: 0 }
  const aim = h !== undefined ? distanceM * 0.2 : 0
  const accuracyM = Math.sqrt(p.accuracy ** 2 * 0.25 + (calibration?.rmsM ?? 0) ** 2 + aim ** 2)
  return { position: { x: base.x + d.x, y: base.y + d.y }, accuracyM: Math.max(accuracyM, 1), aimed: h !== undefined }
}

/** Instants (s) où prendre une image : toutes les `everyS` secondes, jamais plus de `max`, en laissant la 1re seconde. */
export function frameTimes(durationS: number, everyS = 2, max = 30): number[] {
  if (!Number.isFinite(durationS) || durationS <= 0 || everyS <= 0) return []
  const out: number[] = []
  for (let t = Math.min(1, durationS / 2); t < durationS - 0.1 && out.length < max; t += everyS) out.push(Math.round(t * 100) / 100)
  return out
}
