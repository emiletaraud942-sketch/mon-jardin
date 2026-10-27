// Services IGN Géoplateforme (Licence Ouverte, sans clé).
// Toutes les requêtes passent par /ext/geopf et /ext/apicarto (proxy Vite en dev, rewrites Vercel en prod).
// PROPRIÉTAIRE : agent dev-cartographie-ign. Les signatures ci-dessous sont le contrat ; ne pas les changer.
//
// Formats vérifiés sur les services réels (octobre 2026) :
// - géocodage : GeoJSON FeatureCollection, properties.label/city/postcode/citycode, coordonnées [lon, lat] ;
// - API Carto cadastre : FeatureCollection de MultiPolygon, properties.idu/contenance/nom_com ;
//   un point d'adresse BAN tombe souvent sur la voirie (hors parcelle) → repli sur une recherche par emprise ;
// - WFS 2.0 + EPSG:4326 : la BBOX s'écrit lat,lon (ordre des axes EPSG) mais le GeoJSON renvoyé est en lon,lat ;
// - altimétrie : {"elevations":[z…]} avec zonly=true, -99999 hors couverture, 5 000 points max, 5 req/s/IP.
import type { LonLat, TerrainGrid, XY } from '../types'
import { distanceToRing, pointInRing, toLocal, toLonLat } from './geo'
import { fetchJson } from './http'

export interface GeocodeResult {
  label: string
  lon: number
  lat: number
  city?: string
  postcode?: string
  citycode?: string
}

export interface ParcelResult {
  /** ex. "75056000AB0123" */
  ref: string
  /** Contours extérieurs en lon/lat (une parcelle peut être multipolygone). */
  rings: LonLat[][]
  /** Contenance cadastrale (m²) si fournie. */
  contenanceM2?: number
  commune?: string
}

export interface BuildingResult {
  id: string
  ring: LonLat[]
  heightM: number
}

const WMTS = '/ext/geopf/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'

/** Taille des tuiles WMTS demandées (px). Avec 512 MapLibre demanderait un niveau de moins : à garder à 256. */
export const TILE_SIZE = 256

/** Tuiles XYZ pour MapLibre (raster 256 px). Vérifiées : image/jpeg et image/png renvoyées en z18. */
export const ORTHO_TILES = `${WMTS}&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg`
export const PLAN_TILES = `${WMTS}&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png`
export const CADASTRE_TILES = `${WMTS}&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=PCI%20vecteur&FORMAT=image/png`
export const IGN_ATTRIBUTION = '© IGN – Géoplateforme'

/**
 * Zoom maximal des tuiles à demander (au-delà MapLibre sur-échantillonne : `maxzoom` de la source).
 * ORTHO_MAXZOOM = 19 : VÉRIFIÉ le 27 oct. 2026 sur un point (lon 1,0411 ; lat 49,5328, Normandie) :
 * ORTHOIMAGERY.ORTHOPHOTOS répond en z17, z18 et z19 (≈ 0,2 m par pixel) puis 404 en z20 et z21.
 * HR.ORTHOIMAGERY.ORTHOPHOTOS donne la même tuile z19 ; THR.ORTHOIMAGERY.ORTHOPHOTOS répond 404 dès z19 ici.
 * Aucune photo plus fine n'est donc disponible : on ne change pas de couche. Valeur mesurée sur un seul point
 * (la couverture peut varier ailleurs) ; le repli de MapLibre étire alors la dernière tuile reçue.
 * PLAN_MAXZOOM et CADASTRE_MAXZOOM : NON VÉRIFIÉS (GetCapabilities inaccessible depuis le conteneur de dev),
 * seul z18 est confirmé pour ces deux couches. À relever dans le TileMatrixSetLimits de la couche en PM.
 * Le zoom de CARTE correspondant à ces niveaux est calculé dans `src/features/map/photoZoom.ts`.
 */
export const ORTHO_MAXZOOM = 19
export const PLAN_MAXZOOM = 18
export const CADASTRE_MAXZOOM = 18

const R = 6378137

// ---------- utilitaires ----------

const RETRY_DELAY_MS = 600
const SERVICE = 'Géoplateforme IGN'

/** Erreur réseau ou 5xx/429 (messages de `fetchJson`) : un nouvel essai a une chance de réussir. */
function isRetryable(e: unknown): boolean {
  if (!(e instanceof Error) || e.name === 'AbortError') return false
  return e.message.startsWith('Connexion impossible') || /\((429|5\d\d)\)/.test(e.message)
}

function abortError(): Error {
  const e = new Error('Requête annulée.')
  e.name = 'AbortError'
  return e
}

interface GetOpts {
  service?: string
  timeoutMs?: number
  signal?: AbortSignal
}

/** GET JSON avec délai (15 s par défaut) et un seul réessai après 600 ms (tous nos appels sont idempotents). */
async function getJson<T>(url: string, opts: GetOpts = {}): Promise<T> {
  const { service = SERVICE, timeoutMs = 15000, signal } = opts
  if (signal?.aborted) throw abortError()
  const call = () => fetchJson<T>(url, { service, timeoutMs, signal })
  try {
    return await call()
  } catch (e) {
    if (!isRetryable(e)) throw e
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    if (signal?.aborted) throw abortError()
    return call()
  }
}

const f7 = (v: number) => v.toFixed(7)

interface GeoJsonFeature {
  id?: string | number
  geometry: { type: string; coordinates: unknown } | null
  properties: Record<string, unknown> | null
}
interface GeoJsonFC {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

/** Contours extérieurs d'un Polygon / MultiPolygon GeoJSON, sans le point de fermeture ni l'altitude. */
export function outerRings(geometry: GeoJsonFeature['geometry']): LonLat[][] {
  if (!geometry) return []
  let polys: number[][][][]
  if (geometry.type === 'Polygon') polys = [geometry.coordinates as number[][][]]
  else if (geometry.type === 'MultiPolygon') polys = geometry.coordinates as number[][][][]
  else return []
  const out: LonLat[][] = []
  for (const poly of polys) {
    const outer = poly?.[0]
    if (!outer || outer.length < 3) continue
    const ring = outer.map((c) => ({ lon: c[0], lat: c[1] }))
    const a = ring[0]
    const b = ring[ring.length - 1]
    if (ring.length > 3 && a.lon === b.lon && a.lat === b.lat) ring.pop()
    out.push(ring)
  }
  return out
}

// ---------- géocodage ----------

const geocodeCache = new Map<string, GeocodeResult[]>()

export function parseGeocode(fc: GeoJsonFC): GeocodeResult[] {
  return (fc.features ?? [])
    .filter((f) => f.geometry?.type === 'Point')
    .map((f) => {
      const [lon, lat] = f.geometry!.coordinates as number[]
      const p = f.properties ?? {}
      return {
        label: String(p.label ?? ''),
        lon,
        lat,
        city: (p.city as string) ?? undefined,
        postcode: (p.postcode as string) ?? undefined,
        citycode: (p.citycode as string) ?? undefined,
      }
    })
}

/**
 * Recherche d'adresses (autocomplétion). Avec `signal`, l'appelant peut annuler une réponse devenue
 * périmée : la promesse est alors rejetée avec une erreur `AbortError` (à ignorer côté UI).
 */
export async function geocode(query: string, opts: { signal?: AbortSignal } = {}): Promise<GeocodeResult[]> {
  const q = query.trim().replace(/\s+/g, ' ')
  if (q.length < 3) return []
  const key = q.toLowerCase()
  const hit = geocodeCache.get(key)
  if (hit) return hit
  const url = `/ext/geopf/geocodage/search?q=${encodeURIComponent(q)}&limit=6&index=address`
  const results = parseGeocode(await getJson<GeoJsonFC>(url, { signal: opts.signal }))
  if (geocodeCache.size > 100) geocodeCache.delete(geocodeCache.keys().next().value as string)
  geocodeCache.set(key, results)
  return results
}

// ---------- cadastre ----------

function featureToParcel(f: GeoJsonFeature): ParcelResult | null {
  const p = f.properties ?? {}
  const rings = outerRings(f.geometry)
  if (!rings.length) return null
  const contenance = Number(p.contenance)
  return {
    ref: String(p.idu ?? f.id ?? ''),
    rings,
    contenanceM2: Number.isFinite(contenance) && contenance > 0 ? contenance : undefined,
    commune: (p.nom_com as string) ?? undefined,
  }
}

/**
 * Choisit dans une FeatureCollection de parcelles celle qui contient le point,
 * sinon la plus proche (cas fréquent : le point d'adresse est sur le trottoir).
 * Les `rings` de la parcelle renvoyée sont TRIÉS : `rings[0]` est l'anneau qui contient le point
 * (ou, à défaut, le plus proche), ce qui compte pour les multipolygones.
 */
export function pickParcel(fc: GeoJsonFC, p: LonLat, maxDistM = 30): ParcelResult | null {
  let best: ParcelResult | null = null
  let bestD = Infinity
  for (const f of fc.features ?? []) {
    const parcel = featureToParcel(f)
    if (!parcel) continue
    const ranked = parcel.rings
      .map((ring) => {
        const local: XY[] = ring.map((q) => toLocal(p, q))
        const d = pointInRing({ x: 0, y: 0 }, local) ? 0 : distanceToRing({ x: 0, y: 0 }, local)
        return { ring, d }
      })
      .sort((a, b) => a.d - b.d) // tri stable : l'ordre d'origine départage les égalités
    if (ranked[0].d < bestD) {
      bestD = ranked[0].d
      best = { ...parcel, rings: ranked.map((r) => r.ring) }
    }
  }
  return bestD <= maxDistM ? best : null
}

/** BBOX WFS 2.0 en EPSG:4326 : ordre des axes lat,lon (vérifié sur data.geopf.fr). */
export function wfsBbox(center: LonLat, halfM: number): string {
  const sw = toLonLat(center, { x: -halfM, y: -halfM })
  const ne = toLonLat(center, { x: halfM, y: halfM })
  return `${f7(sw.lat)},${f7(sw.lon)},${f7(ne.lat)},${f7(ne.lon)},urn:ogc:def:crs:EPSG::4326`
}

function wfsUrl(typeName: string, center: LonLat, halfM: number, count: number): string {
  return (
    '/ext/geopf/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
    `&TYPENAMES=${typeName}&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326` +
    `&BBOX=${wfsBbox(center, halfM)}&COUNT=${count}`
  )
}

/** Parcelle cadastrale qui contient le point, ou null. */
export async function fetchParcel(p: LonLat): Promise<ParcelResult | null> {
  const geom = JSON.stringify({ type: 'Point', coordinates: [Number(f7(p.lon)), Number(f7(p.lat))] })
  let apicartoError: unknown = null
  try {
    const fc = await getJson<GeoJsonFC>(
      `/ext/apicarto/api/cadastre/parcelle?geom=${encodeURIComponent(geom)}`,
      { service: 'API Carto (cadastre)' },
    )
    const hit = pickParcel(fc, p, 0)
    if (hit) return hit
  } catch (e) {
    apicartoError = e
  }
  // Repli : WFS Parcellaire Express de la Géoplateforme autour du point (± 20 m), parcelle la plus proche.
  try {
    const fc = await getJson<GeoJsonFC>(
      wfsUrl('CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle', p, 20, 50),
    )
    return pickParcel(fc, p, 30)
  } catch (e) {
    throw apicartoError ?? e
  }
}

// ---------- bâtiments ----------

export function buildingHeight(props: Record<string, unknown>): number {
  const h = Number(props.hauteur)
  if (props.hauteur != null && Number.isFinite(h) && h > 0) return h
  const et = Number(props.nombre_d_etages)
  if (props.nombre_d_etages != null && Number.isFinite(et) && et > 0) return et * 3
  return 6
}

export function parseBuildings(fc: GeoJsonFC, max = 200): BuildingResult[] {
  const out: BuildingResult[] = []
  for (const f of fc.features ?? []) {
    const props = f.properties ?? {}
    const baseId = String(props.cleabs ?? f.id ?? out.length)
    const heightM = buildingHeight(props)
    const rings = outerRings(f.geometry)
    rings.forEach((ring, i) => out.push({ id: rings.length > 1 ? `${baseId}-${i}` : baseId, ring, heightM }))
    if (out.length >= max) break
  }
  return out.slice(0, max)
}

/** Bâtiments BD TOPO dans un carré de demi-côté radiusM autour du centre. */
export async function fetchBuildings(center: LonLat, radiusM: number): Promise<BuildingResult[]> {
  const fc = await getJson<GeoJsonFC>(wfsUrl('BDTOPO_V3:batiment', center, radiusM, 200))
  return parseBuildings(fc, 200)
}

// ---------- relief ----------

const ALTI_BATCH = 200 // limite serveur 5 000 points, mais on garde des URL GET courtes (< 6 ko)
const NODATA = -99999

/** Points de la grille n×n, du sud vers le nord puis d'ouest en est. */
export function terrainPoints(center: LonLat, halfSizeM: number, n: number): LonLat[] {
  const pts: LonLat[] = []
  const step = n > 1 ? (2 * halfSizeM) / (n - 1) : 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const xy = n > 1 ? { x: -halfSizeM + i * step, y: -halfSizeM + j * step } : { x: 0, y: 0 }
      pts.push(toLonLat(center, xy))
    }
  }
  return pts
}

/** Remplace les valeurs manquantes par la moyenne des voisins valides (itératif), sinon 0. */
export function fillMissing(values: (number | null)[], n: number): number[] {
  const v = values.slice()
  for (let pass = 0; pass < 2 * n && v.some((x) => x == null); pass++) {
    const next = v.slice()
    for (let k = 0; k < v.length; k++) {
      if (v[k] != null) continue
      const i = k % n
      const j = Math.floor(k / n)
      let s = 0
      let c = 0
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di
        const jj = j + dj
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue
        const w = v[jj * n + ii]
        if (w != null) {
          s += w
          c++
        }
      }
      if (c) next[k] = s / c
    }
    v.splice(0, v.length, ...next)
  }
  return v.map((x) => x ?? 0)
}

export function parseElevations(json: unknown, expected: number): (number | null)[] {
  const arr = (json as { elevations?: unknown[] })?.elevations
  if (!Array.isArray(arr) || arr.length !== expected) throw new Error('Réponse inattendue du service d’altimétrie IGN.')
  return arr.map((e) => {
    const z = typeof e === 'number' ? e : Number((e as { z?: number })?.z)
    return Number.isFinite(z) && z > NODATA + 1 ? z : null
  })
}

async function fetchElevations(points: LonLat[]): Promise<(number | null)[]> {
  const out: (number | null)[] = []
  for (let k = 0; k < points.length; k += ALTI_BATCH) {
    const batch = points.slice(k, k + ALTI_BATCH)
    const url =
      '/ext/geopf/altimetrie/1.0/calcul/alti/rest/elevation.json' +
      `?lon=${batch.map((p) => f7(p.lon)).join('|')}` +
      `&lat=${batch.map((p) => f7(p.lat)).join('|')}` +
      '&resource=ign_rge_alti_wld&delimiter=|&zonly=true'
    // 30 s par lot ; limite de 5 requêtes/s : le 429 est réessayé une fois après 600 ms.
    const json = await getJson<unknown>(url, { timeoutMs: 30000 })
    out.push(...parseElevations(json, batch.length))
  }
  return out
}

/** Construit la grille relative à partir des altitudes brutes (grille puis centre en dernier). */
export function buildTerrain(
  raw: (number | null)[],
  halfSizeM: number,
  n: number,
): { grid: TerrainGrid; altitudeCenterM: number } {
  const gridRaw = raw.slice(0, n * n)
  const valid = gridRaw.filter((z): z is number => z != null)
  if (!valid.length && raw[n * n] == null) throw new Error('Pas de données d’altitude IGN à cet endroit.')
  const centerRaw = raw[n * n]
  const altitudeCenterM = centerRaw ?? valid.reduce((a, b) => a + b, 0) / valid.length
  // Aucun point valide (mais centre connu) : terrain plat.
  const abs = valid.length ? fillMissing(gridRaw, n) : gridRaw.map(() => altitudeCenterM)
  const heights = abs.map((z) => Math.round((z - altitudeCenterM) * 100) / 100)
  return { grid: { size: halfSizeM, n, heights }, altitudeCenterM: Math.round(altitudeCenterM * 100) / 100 }
}

/** Grille d'altitudes (RGE ALTI) relative à l'altitude du centre. */
export async function fetchTerrain(
  center: LonLat,
  halfSizeM: number,
  n: number,
): Promise<{ grid: TerrainGrid; altitudeCenterM: number }> {
  const size = Math.max(1, Math.round(n))
  const pts = [...terrainPoints(center, halfSizeM, size), center]
  return buildTerrain(await fetchElevations(pts), halfSizeM, size)
}

// ---------- orthophoto ----------

/** Coordonnées Web-Mercator (EPSG:3857) en mètres. */
export function toMercator(p: LonLat): { x: number; y: number } {
  const lat = (Math.max(-85.0511, Math.min(85.0511, p.lat)) * Math.PI) / 180
  return { x: (R * p.lon * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + lat / 2)) }
}

/** BBOX EPSG:3857 [minX, minY, maxX, maxY] du carré local [-h, +h] (≈ 2h / cos(lat) mètres Mercator de côté). */
export function orthoBbox(center: LonLat, halfSizeM: number): [number, number, number, number] {
  const sw = toMercator(toLonLat(center, { x: -halfSizeM, y: -halfSizeM }))
  const ne = toMercator(toLonLat(center, { x: halfSizeM, y: halfSizeM }))
  return [sw.x, sw.y, ne.x, ne.y]
}

/** URL d'une image orthophoto (WMS) couvrant exactement le carré local [-halfSizeM, +halfSizeM]. */
export function orthoTextureUrl(center: LonLat, halfSizeM: number, px = 1024): string {
  // Emprise minimale 1 m (évite une BBOX dégénérée) ; les petites emprises (15–100 m) donnent des BBOX valides.
  const bbox = orthoBbox(center, Math.max(1, halfSizeM))
    .map((v) => v.toFixed(2))
    .join(',')
  const size = Number.isFinite(px) ? Math.max(16, Math.min(2048, Math.round(px))) : 1024 // 2048 px vérifié côté serveur
  return (
    '/ext/geopf/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=' +
    `&CRS=EPSG:3857&BBOX=${bbox}&WIDTH=${size}&HEIGHT=${size}&FORMAT=image/jpeg`
  )
}
