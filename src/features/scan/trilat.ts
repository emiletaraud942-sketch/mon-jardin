import type { XY } from '../../types'

// Placer par mesures : cercle autour d'un repère, intersection de deux cercles (pur, testé).

/** « 3,5 », « 3.5 », « 3,5 m » → 3.5. `undefined` si vide, illisible, nul ou au-delà de 200 m. */
export function parseMeters(text: string): number | undefined {
  const t = text.trim().replace(/\s*m(ètres?|etres?)?\.?$/i, '').replace(',', '.').replace(/\s/g, '')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return undefined
  const n = Number(t)
  return Number.isFinite(n) && n > 0 && n <= 200 ? n : undefined
}

/** Point du cercle le plus proche de `near` (le toucher de l'utilisateur est « aimanté » sur le cercle). */
export function pointOnCircle(center: XY, radiusM: number, near: XY): XY {
  const dx = near.x - center.x
  const dy = near.y - center.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-9) return { x: center.x + radiusM, y: center.y }
  return { x: center.x + (dx / d) * radiusM, y: center.y + (dy / d) * radiusM }
}

/** 0, 1 ou 2 points communs à deux cercles. Cercles qui se touchent à peine (écart < 1 cm) : un seul point. */
export function circleIntersections(c1: XY, r1: number, c2: XY, r2: number): XY[] {
  const dx = c2.x - c1.x
  const dy = c2.y - c1.y
  const d = Math.hypot(dx, dy)
  if (d < 1e-9) return []
  const tol = 0.01
  if (d > r1 + r2 + tol || d < Math.abs(r1 - r2) - tol) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const h = h2 > 0 ? Math.sqrt(h2) : 0
  const mx = c1.x + (a * dx) / d
  const my = c1.y + (a * dy) / d
  const p1 = { x: mx + (h * dy) / d, y: my - (h * dx) / d }
  const p2 = { x: mx - (h * dy) / d, y: my + (h * dx) / d }
  return h < 1e-6 ? [p1] : [p1, p2]
}

/** Parmi des points, celui qui est le plus près de `to`. */
export function nearestPoint(points: XY[], to: XY): XY | undefined {
  let best: XY | undefined
  let bd = Infinity
  for (const p of points) {
    const d = Math.hypot(p.x - to.x, p.y - to.y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}

/** Erreur supposée d'une mesure au mètre ruban ou au pas (m). */
export const MEASURE_ERROR_M = 0.3

/**
 * Précision du point à l'intersection : l'erreur de mesure est agrandie quand les deux cercles se croisent en biais
 * (angle faible entre les deux directions).
 */
export function intersectionPrecisionM(c1: XY, c2: XY, p: XY, errM = MEASURE_ERROR_M): number {
  const a1 = Math.atan2(p.y - c1.y, p.x - c1.x)
  const a2 = Math.atan2(p.y - c2.y, p.x - c2.x)
  const s = Math.abs(Math.sin(a1 - a2))
  return (errM * Math.SQRT2) / Math.max(s, 0.2)
}

/** Précision du point posé sur un seul cercle : la distance est sûre, la direction dépend du toucher. */
export function singleCirclePrecisionM(radiusM: number, errM = MEASURE_ERROR_M): number {
  return Math.max(errM, radiusM * 0.1)
}

/** « Environ 0,5 m » : arrondi au dixième, jamais en dessous de 0,3 m. */
export function precisionText(m: number): string {
  const v = Math.max(0.3, Math.round(m * 10) / 10)
  return `environ ${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m`
}
