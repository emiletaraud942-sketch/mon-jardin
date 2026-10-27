// Aides au placement sur une photo floue : résumé des distances, loupe, cercle GPS. Pur, sans DOM.
import { frMeters } from '../../lib/format'
import type { Ruler } from '../../lib/snap'
import type { XY } from '../../types'

const WORD: Record<Ruler['kind'], string> = { limite: 'Limite', batiment: 'Maison', voisine: 'Plante' }

/** « Limite 6 m · Maison 18 m · Plante voisine 5,8 m » : les distances restent lisibles, même si la photo ne l'est pas. */
export function rulerSummary(items: Pick<Ruler, 'kind' | 'distM'>[], max = 3): string {
  return items
    .filter((i) => Number.isFinite(i.distM))
    .slice(0, max)
    .map((i) => `${WORD[i.kind]} ${frMeters(i.distM)}`)
    .join(' · ')
}

/** Durée d'appui avant que la loupe s'ouvre (ms), et déplacement toléré pendant l'appui (px). */
export const LOUPE_HOLD_MS = 350
export const LOUPE_SLOP_PX = 10
/** Côté de la loupe (px CSS), grossissement, distance entre le doigt et le bord de la loupe. */
export const LOUPE_SIZE = 132
export const LOUPE_ZOOM = 2.5
export const LOUPE_GAP = 28

/**
 * Centre de la loupe, en pixels de la carte : au-dessus du doigt, pour que le doigt ne cache pas l'endroit visé.
 * Trop près du haut : à côté du doigt, du côté où il y a le plus de place.
 */
export function loupeCenter(finger: XY, view: { w: number; h: number }, size = LOUPE_SIZE, gap = LOUPE_GAP, topMargin = 8): XY {
  const half = size / 2
  const clampX = (x: number) => Math.max(half + 4, Math.min(view.w - half - 4, x))
  const above = finger.y - gap - half
  if (above - half >= topMargin) return { x: clampX(finger.x), y: above }
  const side = finger.x < view.w / 2 ? finger.x + gap + half : finger.x - gap - half
  return { x: clampX(side), y: Math.max(half + topMargin, finger.y - half) }
}

/** Carré de la carte (pixels de l'écran réel) à copier dans la loupe : centré sur le point visé. */
export function loupeSource(target: XY, size = LOUPE_SIZE, zoom = LOUPE_ZOOM, ratio = 1): { sx: number; sy: number; sw: number } {
  const sw = (size / zoom) * ratio
  return { sx: target.x * ratio - sw / 2, sy: target.y * ratio - sw / 2, sw }
}

/** Rayon (m) du cercle autour d'une position GPS : la précision annoncée, jamais moins de 0,5 m. */
export const gpsCircleRadiusM = (accuracyM: number): number => (Number.isFinite(accuracyM) ? Math.max(0.5, accuracyM) : 5)
