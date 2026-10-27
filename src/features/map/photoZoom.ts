// Zoom utile de la photo aérienne et réglages de revue (adresse `?zoom=…`, `?ortho=…`, `?debug=map`).
// Pur, sans DOM : tout est testé dans photoZoom.test.ts.
//
// Convention MapLibre : une carte de zoom Z dessine le monde sur 512 × 2^Z pixels. Avec des tuiles de 256 px,
// elle demande donc des tuiles de niveau round(Z + 1), plafonnées par le `maxzoom` de la source.
// Le niveau de tuile n s'affiche donc à l'échelle 1:1 (1 pixel de photo = 1 pixel CSS) au zoom de carte n − 1.
import { metersPerPixel } from '../../lib/snap'
import { ORTHO_MAXZOOM, TILE_SIZE } from '../../lib/ign'

/** Zoom de carte où un niveau de tuile s'affiche sans étirement (1 pixel de tuile = 1 pixel CSS). */
export function mapZoomForTileZoom(tileZoom: number, tileSize = TILE_SIZE): number {
  return tileZoom - Math.log2(512 / tileSize)
}

/** Niveau de tuile que MapLibre demande à ce zoom de carte (arrondi, plafonné par le `maxzoom` de la source). */
export function tileZoomRequested(mapZoom: number, maxTileZoom = ORTHO_MAXZOOM, tileSize = TILE_SIZE): number {
  return Math.max(0, Math.min(maxTileZoom, Math.round(mapZoom + Math.log2(512 / tileSize))))
}

/** Zoom de carte maximal utile de la photo : au-delà, MapLibre étire la dernière tuile (z19), sans détail en plus. */
export function photoUsefulMapZoom(maxTileZoom = ORTHO_MAXZOOM, tileSize = TILE_SIZE): number {
  return mapZoomForTileZoom(maxTileZoom, tileSize)
}

/** Sur-échantillonnage toléré au-delà du zoom utile : un niveau (×2), pour viser sans que la photo ne soit trop molle. */
export const PHOTO_OVERSAMPLE_LEVELS = 1

export const PHOTO_USEFUL_ZOOM = photoUsefulMapZoom()
/** Zoom de carte maximal de la vue photo en variante « repères » : utile + 1 niveau (≈ ORTHO_MAXZOOM). */
export const PHOTO_MAX_MAP_ZOOM = PHOTO_USEFUL_ZOOM + PHOTO_OVERSAMPLE_LEVELS

/** Étirement de la photo : nombre de pixels CSS affichés pour un pixel de photo (1 = net, 2 = deux fois plus mou). */
export function photoStretch(mapZoom: number, usefulZoom = PHOTO_USEFUL_ZOOM): number {
  return Math.pow(2, mapZoom - usefulZoom)
}

/** Taille réelle d'un pixel de la photo (m) à cette latitude : ≈ 0,19 m à 49,5° N pour z19. */
export function photoPixelM(latDeg: number, usefulZoom = PHOTO_USEFUL_ZOOM): number {
  return metersPerPixel(usefulZoom, latDeg)
}

/** Écart minimal entre deux lignes de la grille d'aide (px). */
const GRID_1M_MIN_PX = 9.5
const GRID_5M_MIN_PX = 30

/** Pas de la grille d'aide au placement : 1 m si les lignes restent lisibles, sinon 5 m, sinon aucune grille. */
export function gridStepM(mapZoom: number, latDeg: number): 1 | 5 | null {
  const mpp = metersPerPixel(mapZoom, latDeg)
  if (1 / mpp >= GRID_1M_MIN_PX) return 1
  if (5 / mpp >= GRID_5M_MIN_PX) return 5
  return null
}

// ---------- réglages de revue (à retirer une fois le choix fait) ----------

export type ZoomVariant = 'plan' | 'reperes'
export type OrthoTweak = 'net' | 'nearest'

export interface ReviewParams {
  /** `?zoom=plan` : bascule en douceur vers la vue plan ; `?zoom=reperes` : photo plafonnée au zoom utile + 1. */
  zoom?: ZoomVariant
  /** `?ortho=net,nearest` : réglages de netteté de la photo (non validés visuellement). */
  ortho: OrthoTweak[]
  /** `?debug=map` : expose la carte dans `window.__pjMap` (mesures). */
  debug: boolean
}

export function parseReview(search: string): ReviewParams {
  const q = new URLSearchParams(search)
  const z = q.get('zoom')
  const ortho = (q.get('ortho') ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is OrthoTweak => t === 'net' || t === 'nearest')
  return { zoom: z === 'plan' || z === 'reperes' ? z : undefined, ortho, debug: q.get('debug') === 'map' }
}

let cached: ReviewParams | undefined
export function review(): ReviewParams {
  if (!cached) cached = parseReview(typeof location === 'undefined' ? '' : location.search)
  return cached
}

/** Zoom maximal de la carte quand la photo est affichée. */
export function photoCapZoom(r: ReviewParams, hardMax = 22): number {
  return r.zoom === 'reperes' ? Math.min(hardMax, PHOTO_MAX_MAP_ZOOM) : hardMax
}

/** Début et fin du fondu photo → plan (variante « plan ») : dès le zoom utile + 1, fini 0,6 niveau plus haut. */
export const PLAN_FADE_FROM = PHOTO_USEFUL_ZOOM + PHOTO_OVERSAMPLE_LEVELS
export const PLAN_FADE_TO = PLAN_FADE_FROM + 0.6

/** Zoom à partir duquel la mention « la photo n'est pas plus précise » s'affiche. */
export const PHOTO_NOTE_ZOOM = PHOTO_MAX_MAP_ZOOM - 0.1

/**
 * Réglages de peinture de la couche photo selon `?ortho=…`. Aucun réglage par défaut.
 * `net` : contraste et saturation légèrement relevés. `nearest` : pixels non lissés.
 * `raster-brightness-min/max` n'est pas proposé : il ne fait que comprimer la plage des tons (0 à 1), il n'affûte rien.
 */
export function orthoPaint(tweaks: OrthoTweak[]): Record<string, number | string> {
  const paint: Record<string, number | string> = {}
  if (tweaks.includes('net')) {
    paint['raster-contrast'] = 0.2
    paint['raster-saturation'] = 0.1
  }
  if (tweaks.includes('nearest')) paint['raster-resampling'] = 'nearest'
  return paint
}
