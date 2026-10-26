// LiDAR HD de l'IGN (Géoplateforme, Licence Ouverte) : relief MNT et hauteur de canopée MNH à ~1 m.
// Passe par le proxy existant /ext/geopf/wms-r (aucune nouvelle origine, CSP inchangée).
// PROPRIÉTAIRE : agent dev-cartographie-ign.
//
// ÉTAT DE VÉRIFICATION (octobre 2026) : le conteneur de dev n'atteint pas data.geopf.fr (403 du tunnel).
// RIEN ci-dessous n'est vérifié sur le service réel. Éléments SUPPOSÉS d'après la documentation publique :
// - noms de couches WMS-Raster (constantes LIDAR_LAYERS : noms confirmés par GetCapabilities, suffixe .WGS = France métropolitaine ; format x-bil encore à confirmer) ;
// - format `image/x-bil;bits=32` : float32 little-endian brut, première ligne = nord, sans en-tête
//   (même format que RGE ALTI sur la Géoplateforme), valeur « pas de donnée » ≤ -9999 ;
// - couverture progressive du territoire : hors zone, le service renvoie une erreur XML ou du « pas de donnée ».
// À faire avant mise en production : un GetMap réel sur une adresse couverte, puis une fixture de test.
import type { LonLat, TerrainGrid, XY } from '../types'
import { pointInRing, toLocal, toLonLat } from './geo'
import { fetchWithTimeout } from './http'
import { heightAt } from './terrain'

export const LIDAR_LAYERS = {
  mnt: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS',
  mns: 'IGNF_LIDAR-HD_MNS_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS',
  mnh: 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS',
} as const
export type LidarLayer = keyof typeof LIDAR_LAYERS

export const LIDAR_ATTRIBUTION = '© IGN – LiDAR HD (Licence Ouverte)'

/** Arbre (ou groupe d'arbres) détecté : position locale (m), hauteur au-dessus du sol (m), rayon de houppier (m). */
export interface DetectedTree {
  x: number
  y: number
  heightM: number
  radiusM: number
}

export interface LidarData {
  /** Hauteur de canopée et bâtiments au-dessus du sol (m), même convention que TerrainGrid. */
  canopy: TerrainGrid
  /** Arbres détectés dans la canopée. */
  trees: DetectedTree[]
  /** Relief MNT relatif au centre, si disponible. */
  terrain?: TerrainGrid
  altitudeCenterM?: number
}

const NODATA_MAX = -9999
const MIN_TREE_M = 2
const MAX_TREE_M = 60 // au-dessus : artefact (grue, pylône, oiseau)
const MAX_TREES = 80
const MAX_RADIUS_M = 12
const MIN_AREA_M2 = 2

// ---------- requête ----------

/** Pixels par côté pour ~1 m/pixel, borné (le service limite à 2 048 px, la mémoire à moins). */
export function lidarPixels(halfSizeM: number): number {
  return Math.max(16, Math.min(512, Math.round(2 * halfSizeM)))
}

/** URL WMS 1.3.0 en EPSG:3857 (même emprise que l'orthophoto : carré local [-h, +h]). */
export function lidarUrl(layer: LidarLayer, center: LonLat, halfSizeM: number): string {
  const sw = toMercator(toLonLat(center, { x: -halfSizeM, y: -halfSizeM }))
  const ne = toMercator(toLonLat(center, { x: halfSizeM, y: halfSizeM }))
  const bbox = [sw.x, sw.y, ne.x, ne.y].map((v) => v.toFixed(2)).join(',')
  const px = lidarPixels(halfSizeM)
  return (
    `/ext/geopf/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LIDAR_LAYERS[layer]}&STYLES=` +
    `&CRS=EPSG:3857&BBOX=${bbox}&WIDTH=${px}&HEIGHT=${px}&FORMAT=${encodeURIComponent('image/x-bil;bits=32')}`
  )
}

function toMercator(p: LonLat): { x: number; y: number } {
  const R = 6378137
  const lat = (Math.max(-85.0511, Math.min(85.0511, p.lat)) * Math.PI) / 180
  return { x: (R * p.lon * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + lat / 2)) }
}

// ---------- décodage ----------

const NO_COVERAGE = 'Le relief détaillé (LiDAR) n’est pas encore disponible à cet endroit.'

/**
 * Décode un raster float32 little-endian brut (n×n) en grille locale.
 * Les lignes arrivent du nord vers le sud : on les retourne pour obtenir sud → nord (comme TerrainGrid).
 * Valeurs manquantes ou aberrantes → null. Lève une erreur si la taille ne correspond pas.
 */
export function decodeBil32(buf: ArrayBuffer, n: number): (number | null)[] {
  if (buf.byteLength !== n * n * 4) throw new Error(NO_COVERAGE)
  const view = new DataView(buf)
  const out: (number | null)[] = new Array(n * n)
  for (let row = 0; row < n; row++) {
    const j = n - 1 - row
    for (let i = 0; i < n; i++) {
      const v = view.getFloat32((row * n + i) * 4, true)
      out[j * n + i] = Number.isFinite(v) && v > NODATA_MAX && v < 5000 ? v : null
    }
  }
  return out
}

/** Hauteurs MNH : manquant → 0, négatif (bruit) → 0. Refuse une grille presque vide. */
export function canopyFromValues(values: (number | null)[], n: number, halfSizeM: number): TerrainGrid {
  const valid = values.filter((v) => v != null).length
  if (valid < values.length * 0.5) throw new Error(NO_COVERAGE)
  return { size: halfSizeM, n, heights: values.map((v) => (v == null ? 0 : Math.max(0, Math.round(v * 100) / 100))) }
}

/** MNH = MNS - MNT (si le service ne fournit pas directement le MNH). */
export function canopyFromSurface(mns: (number | null)[], mnt: (number | null)[], n: number, halfSizeM: number): TerrainGrid {
  return canopyFromValues(
    mns.map((s, k) => (s == null || mnt[k] == null ? null : s - (mnt[k] as number))),
    n,
    halfSizeM,
  )
}

/** Relief relatif au centre, sur les valeurs absolues du MNT. Valeurs manquantes → altitude moyenne. */
export function terrainFromMnt(values: (number | null)[], n: number, halfSizeM: number): { grid: TerrainGrid; altitudeCenterM: number } {
  const ok = values.filter((v): v is number => v != null)
  if (ok.length < values.length * 0.5) throw new Error(NO_COVERAGE)
  const mean = ok.reduce((a, b) => a + b, 0) / ok.length
  const abs = values.map((v) => v ?? mean)
  // La grille est composée de pixels (centres) : on lit l'altitude au centre du jardin par interpolation.
  const tmp: TerrainGrid = { size: halfSizeM, n, heights: abs }
  const c = heightAt(tmp, { x: 0, y: 0 })
  return {
    grid: { size: halfSizeM, n, heights: abs.map((z) => Math.round((z - c) * 100) / 100) },
    altitudeCenterM: Math.round(c * 100) / 100,
  }
}

async function getRaster(layer: LidarLayer, center: LonLat, halfSizeM: number, signal?: AbortSignal): Promise<(number | null)[]> {
  const r = await fetchWithTimeout(lidarUrl(layer, center, halfSizeM), { timeoutMs: 25000, signal })
  if (!r.ok) throw new Error(`LiDAR IGN a répondu une erreur (${r.status}).`)
  return decodeBil32(await r.arrayBuffer(), lidarPixels(halfSizeM))
}

// ---------- échantillonnage ----------

/** Hauteur de canopée / bâti (m au-dessus du sol) en un point local, interpolée. */
export function canopyHeightAt(canopy: TerrainGrid, p: XY): number {
  if (Math.abs(p.x) > canopy.size || Math.abs(p.y) > canopy.size) return 0
  return heightAt(canopy, p)
}

// ---------- détection des houppiers ----------

/**
 * Regroupe les cellules de hauteur ≥ minHeightM en blobs (voisinage 8) et renvoie un arbre par blob.
 * Position = barycentre pondéré par la hauteur ; hauteur = maximum ; rayon = √(surface/π), plafonné.
 * Les blobs trop petits (< 2 m²) ou trop hauts (> 60 m) sont ignorés. Les plus grands d'abord, 80 au plus.
 */
export function detectTrees(canopy: TerrainGrid, opts: { minHeightM?: number } = {}): DetectedTree[] {
  const { n, size, heights } = canopy
  if (n < 2) return []
  const min = opts.minHeightM ?? MIN_TREE_M
  const step = (2 * size) / (n - 1)
  const seen = new Uint8Array(n * n)
  const trees: DetectedTree[] = []
  const stack: number[] = []
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || !(heights[start] >= min)) continue
    let cells = 0
    let max = 0
    let sw = 0
    let sx = 0
    let sy = 0
    seen[start] = 1
    stack.push(start)
    while (stack.length) {
      const k = stack.pop() as number
      const i = k % n
      const j = (k - i) / n
      const h = heights[k]
      cells++
      max = Math.max(max, h)
      sw += h
      sx += h * i
      sy += h * j
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue
          const q = jj * n + ii
          if (seen[q] || !(heights[q] >= min)) continue
          seen[q] = 1
          stack.push(q)
        }
      }
    }
    const area = cells * step * step
    if (area < MIN_AREA_M2 || max > MAX_TREE_M) continue
    trees.push({
      x: Math.round((-size + (sx / sw) * step) * 100) / 100,
      y: Math.round((-size + (sy / sw) * step) * 100) / 100,
      heightM: Math.round(max * 10) / 10,
      radiusM: Math.round(Math.min(MAX_RADIUS_M, Math.sqrt(area / Math.PI)) * 10) / 10,
    })
  }
  return trees.sort((a, b) => b.radiusM - a.radiusM).slice(0, MAX_TREES)
}

/**
 * Écarte les « arbres » déjà connus : ceux dont le centre est dans un bâtiment BD TOPO (le MNH inclut les toits)
 * ou près d'une plante du jardin (déjà simulée par le moteur).
 */
export function filterTrees(
  trees: DetectedTree[],
  opts: { buildingRings?: XY[][]; plantPositions?: XY[]; plantRadiusM?: number } = {},
): DetectedTree[] {
  const { buildingRings = [], plantPositions = [], plantRadiusM = 1.5 } = opts
  return trees.filter((t) => {
    const p = { x: t.x, y: t.y }
    if (buildingRings.some((r) => r.length >= 3 && pointInRing(p, r))) return false
    return !plantPositions.some((q) => Math.hypot(q.x - t.x, q.y - t.y) <= Math.max(plantRadiusM, t.radiusM * 0.5))
  })
}

/** Anneaux de bâtiments en repère local, à partir de coordonnées lon/lat. */
export function ringsToLocal(center: LonLat, rings: LonLat[][]): XY[][] {
  return rings.map((r) => r.map((p) => toLocal(center, p)))
}

// ---------- cache IndexedDB ----------

const CACHE_PREFIX = 'lidar:'
const CACHE_VERSION = 1
const CACHE_TTL_MS = 90 * 24 * 3600 * 1000

interface CacheEntry {
  v: number
  at: number
  data: LidarData
}

export function lidarCacheKey(center: LonLat, halfSizeM: number): string {
  return `${CACHE_PREFIX}${center.lat.toFixed(4)},${center.lon.toFixed(4)},${Math.round(halfSizeM)}`
}

export function isFreshEntry(e: unknown, now = Date.now()): e is CacheEntry {
  const c = e as CacheEntry | null
  return !!c && c.v === CACHE_VERSION && typeof c.at === 'number' && now - c.at < CACHE_TTL_MS && !!c.data?.canopy?.heights
}

async function readCache(key: string): Promise<LidarData | null> {
  try {
    const { get } = await import('idb-keyval')
    const e = await get(key)
    return isFreshEntry(e) ? e.data : null
  } catch {
    return null // IndexedDB indisponible : on passe au réseau
  }
}

async function writeCache(key: string, data: LidarData): Promise<void> {
  try {
    const { set } = await import('idb-keyval')
    await set(key, { v: CACHE_VERSION, at: Date.now(), data } satisfies CacheEntry)
  } catch {
    // cache facultatif
  }
}

// ---------- API ----------

/**
 * Relief + canopée LiDAR HD autour du jardin (demi-côté 60 m par défaut), avec cache IndexedDB.
 * Renvoie null (jamais d'exception) si le service est indisponible ou la zone non couverte :
 * l'appelant garde alors le comportement actuel (RGE ALTI, bâtiments BD TOPO seuls).
 * `onWarning` reçoit une phrase simple et, derrière, le détail technique.
 */
export async function fetchLidar(
  center: LonLat,
  opts: { halfSizeM?: number; signal?: AbortSignal; /** Ignore le cache (bouton « Actualiser »). */ force?: boolean; onWarning?: (message: string, detail?: string) => void } = {},
): Promise<LidarData | null> {
  const half = opts.halfSizeM ?? 60
  const key = lidarCacheKey(center, half)
  const cached = opts.force ? null : await readCache(key)
  if (cached) return cached
  const n = lidarPixels(half)
  try {
    const mnh = await getRaster('mnh', center, half, opts.signal)
    const canopy = canopyFromValues(mnh, n, half)
    const data: LidarData = { canopy, trees: detectTrees(canopy) }
    try {
      const t = terrainFromMnt(await getRaster('mnt', center, half, opts.signal), n, half)
      data.terrain = t.grid
      data.altitudeCenterM = t.altitudeCenterM
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e // relief seul indisponible : la canopée reste utile
    }
    await writeCache(key, data)
    return data
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    const msg = e instanceof Error ? e.message : ''
    opts.onWarning?.('Le relief détaillé n’a pas pu être chargé. La carte et les ombres utilisent les données habituelles.', msg || undefined)
    return null
  }
}
