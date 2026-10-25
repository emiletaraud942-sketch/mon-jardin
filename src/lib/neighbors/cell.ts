// Quartier : fonctions pures. Aucune position exacte ne doit sortir de l'appareil.
// Deux tailles de cellule (même grille que le déclencheur SQL, voir la migration v6) :
//   standard : pas de 0,02° en latitude et 0,03° en longitude (environ 2 km)
//   large    : pas de 0,05° en latitude et 0,07° en longitude (environ 5 km, pour la campagne)
import type { Cell, CellSize } from './types'

const KM_PER_DEG = 111.32

/** Pas de la grille, en centièmes de degré (entiers : pas d'erreur d'arrondi flottant). */
export const CELL_STEPS: Record<CellSize, { lat: number; lon: number; label: string; aboutKm: number }> = {
  standard: { lat: 2, lon: 3, label: 'environ 2 km', aboutKm: 2 },
  large: { lat: 5, lon: 7, label: 'environ 5 km', aboutKm: 5 },
}

export const isCellSize = (v: unknown): v is CellSize => v === 'standard' || v === 'large'

/** Arrondi à la grille : floor(x / pas + 0,5) * pas. Même formule que `neighbors_cell_snap` (SQL). */
function snap(v: number, stepHundredths: number): number {
  const q = Math.floor((v * 100) / stepHundredths + 0.5 + 1e-9)
  const hundredths = q * stepHundredths
  return hundredths === 0 ? 0 : hundredths / 100 // pas de -0
}

/** Centre de la cellule qui contient le point, pour la taille choisie. Idempotent. */
export function roundCell(lat: number, lon: number, size: CellSize): Cell {
  const s = CELL_STEPS[size]
  return { lat: snap(lat, s.lat), lon: snap(lon, s.lon) }
}

export function isValidCoord(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/** Vrai si la cellule est bien sur la grille de cette taille (aucune coordonnée « fine »). */
export function isOnGrid(c: Cell, size: CellSize): boolean {
  const r = roundCell(c.lat, c.lon, size)
  return r.lat === c.lat && r.lon === c.lon
}

/** Distance approximative en km entre les CENTRES de deux cellules (plan local, suffisant à l'échelle d'un quartier). */
export function cellDistanceKm(a: Cell, b: Cell): number {
  const dLat = (b.lat - a.lat) * KM_PER_DEG
  const dLon = (b.lon - a.lon) * KM_PER_DEG * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

export interface DistanceOptions {
  /** Les deux personnes sont dans la même cellule. */
  sameCell?: boolean
  /** Taille de cellule la plus grande des deux personnes (la distance ne peut pas être plus précise que ça). */
  size?: CellSize
}

/**
 * Libellé honnête : la distance est celle entre les centres de cellules, donc jamais plus précise que la cellule.
 * Même cellule : « dans votre quartier ». Sinon « à environ N km », avec N au moins égal à la taille de la cellule
 * (2 km en standard, 5 km en large).
 */
export function distanceLabel(km: number | null | undefined, opts: DistanceOptions = {}): string {
  if (km == null || !Number.isFinite(km)) return 'distance inconnue'
  if (opts.sameCell) return 'dans votre quartier'
  const min = CELL_STEPS[opts.size ?? 'standard'].aboutKm
  if (km <= 0) return 'dans votre quartier'
  return `à environ ${Math.max(min, Math.round(km))} km`
}

/** Marge, en km, entre le centre d'une cellule et son bord le plus éloigné (demi-diagonale, cellule large). */
export const CELL_SLACK_KM = 3

/**
 * Rectangle de cellules à interroger pour un rayon donné (filtrage grossier côté base, exact côté client).
 * Les quatre bornes sont alignées sur la grille « large » et élargies d'une cellule : la requête ne contient donc
 * jamais une coordonnée plus fine que la grille, et une cellule qui touche le rayon n'est pas oubliée.
 */
export function cellBounds(center: Cell, radiusKm: number) {
  const sLat = CELL_STEPS.large.lat
  const sLon = CELL_STEPS.large.lon
  const dLat = radiusKm / KM_PER_DEG
  const cos = Math.max(0.01, Math.cos((center.lat * Math.PI) / 180))
  const dLon = radiusKm / (KM_PER_DEG * cos)
  // Calcul en centièmes de degré (entiers), puis une seule division : pas de 0,8999999999999999.
  const down = (v: number, step: number) => Math.floor((v * 100) / step + 1e-9) * step - step
  const up = (v: number, step: number) => Math.ceil((v * 100) / step - 1e-9) * step + step
  return {
    latMin: down(center.lat - dLat, sLat) / 100,
    latMax: up(center.lat + dLat, sLat) / 100,
    lonMin: down(center.lon - dLon, sLon) / 100,
    lonMax: up(center.lon + dLon, sLon) / 100,
  }
}
