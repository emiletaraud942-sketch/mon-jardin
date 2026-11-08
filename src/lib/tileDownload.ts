// « Télécharger ma zone » : précharge la photo aérienne (WMTS IGN, z15 à z19) autour du jardin dans le cache `ign-tuiles`,
// celui que le service worker (CacheFirst) consulte déjà : la carte s'ouvre ensuite sans internet autour du jardin.
// Respect du service : au plus 150 tuiles par zone, 4 requêtes à la fois, uniquement `/ext/geopf/wmts` (proxy de l'appli).
// Jamais de requête hors de ce chemin, jamais de tuile absente (404) ou en erreur gardée en cache.
import type { LonLat, XY } from '../types'
import { toLonLat } from './geo'
import { fetchWithTimeout, createLimiter } from './http'
import { ORTHO_TILES } from './ign'

export const TILE_CACHE = 'ign-tuiles'
/** Niveaux préchargés : de la vue du quartier (z15) à la photo la plus fine (z19). */
export const TILE_ZOOMS: readonly number[] = [15, 16, 17, 18, 19]
/** Autour de la parcelle (m). */
export const TILE_MARGIN_M = 150
/** Plafond de tuiles par zone : ménage le service de l'IGN et la place sur l'appareil. */
export const MAX_ZONE_TILES = 150
export const TILE_CONCURRENCY = 4
/** Poids moyen d'une tuile photo de 256 px (JPEG) : estimation prudente pour contrôler la place. */
export const TILE_ESTIMATE_BYTES = 35 * 1024
const WMTS_PATH = '/ext/geopf/wmts'

export interface TileRef {
  z: number
  x: number
  y: number
}

/** Tuile Web Mercator (schéma XYZ, 256 px) qui contient le point. */
export function tileOf(p: LonLat, z: number): { x: number; y: number } {
  const n = 2 ** z
  const lat = (Math.max(-85.0511, Math.min(85.0511, p.lat)) * Math.PI) / 180
  const x = Math.floor(((p.lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n)
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v))
  return { x: clamp(x), y: clamp(y) }
}

export interface LocalRect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Toutes les tuiles des niveaux demandés qui recouvrent un rectangle local (m, centre du jardin en origine). */
export function tilesForRect(center: LonLat, rect: LocalRect, zooms: readonly number[] = TILE_ZOOMS): TileRef[] {
  const sw = toLonLat(center, { x: rect.minX, y: rect.minY })
  const ne = toLonLat(center, { x: rect.maxX, y: rect.maxY })
  const out: TileRef[] = []
  for (const z of zooms) {
    const a = tileOf({ lon: sw.lon, lat: ne.lat }, z) // coin nord-ouest : plus petit x et y
    const b = tileOf({ lon: ne.lon, lat: sw.lat }, z) // coin sud-est
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) out.push({ z, x, y })
  }
  return out
}

/** Rectangle englobant la parcelle (ou ±20 m autour du centre si elle est inconnue), élargi de `marginM`. */
export function zoneRect(parcel: XY[] | undefined, marginM: number): LocalRect {
  const pts = parcel && parcel.length >= 3 ? parcel : [{ x: -20, y: -20 }, { x: 20, y: 20 }]
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs) - marginM, maxX: Math.max(...xs) + marginM, minY: Math.min(...ys) - marginM, maxY: Math.max(...ys) + marginM }
}

export interface ZonePlan {
  tiles: TileRef[]
  /** Marge réellement retenue (m) : réduite si 150 m auraient dépassé le plafond. */
  marginM: number
}

/**
 * Tuiles à garder autour d'un jardin : parcelle + 150 m, z15 à z19. Si le total dépasse le plafond, la marge diminue
 * par paliers de 25 m, puis la zone se resserre autour du centre : jamais plus de `cap` tuiles.
 */
export function planZone(garden: { center: LonLat; parcel?: XY[] }, opts: { marginM?: number; zooms?: readonly number[]; cap?: number } = {}): ZonePlan {
  const { zooms = TILE_ZOOMS, cap = MAX_ZONE_TILES } = opts
  let marginM = opts.marginM ?? TILE_MARGIN_M
  for (;;) {
    const tiles = tilesForRect(garden.center, zoneRect(garden.parcel, marginM), zooms)
    if (tiles.length <= cap) return { tiles, marginM }
    if (marginM > 0) marginM = Math.max(0, marginM - 25)
    else break
  }
  // Parcelle seule trop vaste : on garde un carré centré, de plus en plus petit.
  const r0 = zoneRect(garden.parcel, 0)
  let half = Math.max(Math.abs(r0.minX), Math.abs(r0.maxX), Math.abs(r0.minY), Math.abs(r0.maxY))
  for (let i = 0; i < 40; i++) {
    half *= 0.85
    const tiles = tilesForRect(garden.center, { minX: -half, maxX: half, minY: -half, maxY: half }, zooms)
    if (tiles.length <= cap) return { tiles, marginM: 0 }
  }
  return { tiles: tilesForRect(garden.center, { minX: -1, maxX: 1, minY: -1, maxY: 1 }, zooms), marginM: 0 }
}

/** Adresse relative d'une tuile photo (la même que celle que MapLibre demande : même clé de cache). */
export function tilePath(t: TileRef): string {
  return ORTHO_TILES.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
}

export function estimateBytes(count: number): number {
  return count * TILE_ESTIMATE_BYTES
}

// ---------- téléchargement ----------

export interface TileCacheLike {
  match(request: string): Promise<Response | undefined>
  put(request: string, response: Response): Promise<void>
}

export interface DownloadProgress {
  done: number
  total: number
  kept: number
}

export interface DownloadResult {
  /** Tuiles présentes dans le cache à la fin (déjà là ou téléchargées). */
  kept: number
  /** Tuiles absentes du service (hors couverture) : jamais gardées. */
  missing: number
  failed: number
  total: number
  cancelled: boolean
  /** Le service a répondu « trop de requêtes » : le téléchargement s'est arrêté là. */
  rateLimited: boolean
}

/** Copie d'une réponse sans en-tête `Vary` : la clé de cache ne dépend plus des en-têtes de la requête d'origine. */
async function storable(r: Response): Promise<Response> {
  const body = await r.blob()
  const headers = new Headers()
  headers.set('content-type', r.headers.get('content-type') ?? 'image/jpeg')
  headers.set('date', r.headers.get('date') ?? new Date().toUTCString())
  const cc = r.headers.get('cache-control')
  if (cc) headers.set('cache-control', cc)
  return new Response(body, { status: 200, headers })
}

export async function downloadTiles(
  tiles: TileRef[],
  opts: {
    cache: TileCacheLike
    signal?: AbortSignal
    onProgress?: (p: DownloadProgress) => void
    fetchTile?: (url: string, init: { signal?: AbortSignal; timeoutMs: number }) => Promise<Response>
    origin?: string
    concurrency?: number
    /** Écart minimal entre deux départs (ms). */
    gapMs?: number
  },
): Promise<DownloadResult> {
  const { cache, signal, onProgress, fetchTile = fetchWithTimeout, concurrency = TILE_CONCURRENCY } = opts
  const origin = opts.origin ?? (typeof location === 'undefined' ? 'http://localhost' : location.origin)
  const limiter = createLimiter(Math.min(concurrency, TILE_CONCURRENCY), opts.gapMs ?? 25)
  const total = tiles.length
  const res: DownloadResult = { kept: 0, missing: 0, failed: 0, total, cancelled: false, rateLimited: false }
  let done = 0
  const step = () => {
    done++
    onProgress?.({ done, total, kept: res.kept })
  }
  const one = async (t: TileRef) => {
    if (signal?.aborted || res.rateLimited) return
    const url = new URL(tilePath(t), origin)
    // Garde-fou : rien ne part ailleurs que vers le proxy WMTS de l'appli.
    if (url.origin !== origin || url.pathname !== WMTS_PATH) throw new Error('Adresse de tuile inattendue.')
    const key = url.toString()
    try {
      if (await cache.match(key)) {
        res.kept++
        return
      }
      const r = await fetchTile(key, { signal, timeoutMs: 15000 })
      if (r.status === 429) {
        res.rateLimited = true
        return
      }
      if (r.status === 200 && /^image\//.test(r.headers.get('content-type') ?? '')) {
        await cache.put(key, await storable(r))
        res.kept++
      } else if (r.status === 404) res.missing++
      else res.failed++
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      res.failed++
    } finally {
      step()
    }
  }
  await Promise.allSettled(tiles.map((t) => limiter.run(() => one(t), signal)))
  res.cancelled = !!signal?.aborted
  return res
}

/** Combien de ces tuiles sont déjà dans le cache (sans rien télécharger). */
export async function countCached(tiles: TileRef[], cache: Pick<TileCacheLike, 'match'>, origin = location.origin): Promise<number> {
  let n = 0
  for (const t of tiles) if (await cache.match(new URL(tilePath(t), origin).toString())) n++
  return n
}

/** Message de fin en mots simples. */
export function downloadMessage(r: Pick<DownloadResult, 'kept' | 'cancelled' | 'rateLimited' | 'total'>): string {
  const gardees = r.kept > 1 ? `${r.kept} tuiles gardées` : `${r.kept} tuile gardée`
  if (r.rateLimited) return `${gardees}. Le service de cartes est très sollicité. Réessayez dans quelques minutes.`
  if (r.cancelled) return `Arrêté : ${gardees}.`
  if (r.kept === 0) return 'Aucune tuile gardée. Réessayez avec une meilleure connexion.'
  return `${gardees}, la carte marchera sans internet autour de votre jardin.`
}
