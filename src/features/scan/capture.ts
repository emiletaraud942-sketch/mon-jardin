import { applyCalibration, headingToOffset, type Calibration } from '../../lib/calibration'
import type { XY } from '../../types'
import type { Sample } from './gps'

// Position proposée pour une plante photographiée (pur, testé).

export interface Offset {
  /** Direction visée, en degrés (0 = nord, 90 = est). */
  headingDeg: number
  /** Distance entre moi et la plante (m). */
  distanceM: number
}

export interface Proposed {
  position: XY
  /** Précision estimée (m). */
  accuracyM: number
}

/** Erreur supposée de la visée, par mètre de distance (boussole d'un téléphone : quelques degrés). */
const AIM_ERROR_PER_M = 0.12

/**
 * Position proposée : relevé GPS corrigé par le recalage, plus un décalage éventuel « la plante est à N m devant moi ».
 * Précision : agrège le signal, la dispersion, l'erreur de recalage et celle de la visée.
 */
export function proposePosition(sample: Pick<Sample, 'x' | 'y' | 'spreadM' | 'accuracyM'>, calibration: Calibration | null | undefined, offset?: Offset): Proposed {
  const base = applyCalibration(calibration, { x: sample.x, y: sample.y })
  const d = offset ? headingToOffset(offset.headingDeg, offset.distanceM) : { x: 0, y: 0 }
  const parts = [calibration ? Math.max(sample.spreadM, 0.5 * sample.accuracyM) : sample.accuracyM, calibration?.rmsM ?? 0, offset ? offset.distanceM * AIM_ERROR_PER_M : 0]
  const accuracyM = Math.sqrt(parts.reduce((s, v) => s + v * v, 0))
  return { position: { x: base.x + d.x, y: base.y + d.y }, accuracyM }
}

const POINTS = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest']

/** Cap en toutes lettres : 100 → « est ». */
export function compassName(deg: number): string {
  const d = ((deg % 360) + 360) % 360
  return POINTS[Math.round(d / 45) % 8]
}

/**
 * Cap tiré d'un événement d'orientation. iOS donne `webkitCompassHeading` (déjà par rapport au nord).
 * Ailleurs, seul `deviceorientationabsolute` (alpha mesuré par rapport au nord) est fiable ; sinon `undefined`.
 */
export function headingFromEvent(e: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number | null }): number | undefined {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return (e.webkitCompassHeading + 360) % 360
  if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return (360 - e.alpha + 360) % 360
  return undefined
}
