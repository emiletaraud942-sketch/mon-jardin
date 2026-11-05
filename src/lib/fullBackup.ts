// Sauvegarde complète : un seul fichier JSON avec les données ET les photos (plantes, points de vue).
// Choix : pas de bibliothèque zip. Les photos sont des JPEG déjà réduits (≈ 300 à 700 Ko) : en base64 le fichier
// pèse un tiers de plus que les images, ce qui reste raisonnable sous le plafond ci-dessous.
// Compatible dans les deux sens : l'ancien format (sans `photos`) se reprend tel quel, et un ancien lecteur
// ignore `photos` et reprend les données.
import { isoDate } from './dates'
import { migrateState, serializeState, type MigrateResult, type StateData } from './migrate'
import { getPhoto, PHOTO_PREFIX } from './photos'
import { imageSize, sizeWithinLimits } from './security/image'
import { LIMITS } from './security/limits'
import { isPhotoId, isRecord } from './security/sanitize'
import { ensureRoom, writeWithRetry } from './space'
import { del, set } from 'idb-keyval'
import { downloadBlob, noteExportDone } from './backup'

export const FULL_KIND = 'permajardin-complet'
const MB = 1024 * 1024
/** Poids maximal des images d'une sauvegarde complète (octets, avant base64) : le fichier fait alors ≈ 82 Mo. */
export const FULL_MAX_PHOTO_BYTES = 60 * MB
/** Fichier le plus gros que l'on accepte de reprendre. */
export const FULL_MAX_FILE_BYTES = 100 * MB
/** Taille maximale d'une image reprise (octets). */
const MAX_ONE_PHOTO = 6 * MB
const MAX_PHOTOS = 3000
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const sizeText = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  return `${(bytes / MB).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

// ---------- Identifiants de photos à emporter ----------

export interface PhotoRefs {
  plants: string[]
  panoramas: string[]
}

/** Identifiants de photos cités par les données (une fois chacun). */
export function photoRefs(data: Pick<StateData, 'gardens' | 'plants'>): PhotoRefs {
  const plants = new Set<string>()
  for (const p of data.plants) for (const id of p.photos ?? []) if (isPhotoId(id)) plants.add(id)
  const panoramas = new Set<string>()
  for (const g of data.gardens) for (const pano of g.panoramas ?? []) for (const s of pano.shots) if (isPhotoId(s.photoId) && !plants.has(s.photoId)) panoramas.add(s.photoId)
  return { plants: [...plants], panoramas: [...panoramas] }
}

export interface Measure {
  plantsBytes: number
  panoramasBytes: number
  /** Photos citées dont l'image n'existe plus sur l'appareil. */
  missing: number
  count: number
}

/** Poids des images citées (lecture de chaque image, sans l'encoder). */
export async function measurePhotos(refs: PhotoRefs, read: (id: string) => Promise<Blob | undefined> = getPhoto): Promise<Measure> {
  const m: Measure = { plantsBytes: 0, panoramasBytes: 0, missing: 0, count: 0 }
  for (const [ids, key] of [[refs.plants, 'plantsBytes'], [refs.panoramas, 'panoramasBytes']] as const) {
    for (const id of ids) {
      const b = await read(id)
      if (!b) m.missing++
      else {
        m[key] += b.size
        m.count++
      }
    }
  }
  return m
}

export type FullPlan = { ok: true; withPanoramas: boolean; bytes: number; fileBytes: number } | { ok: false; reason: 'trop-gros'; bytes: number }

/** Taille approchée du fichier : base64 (×4/3) plus une marge pour le reste. */
export const fileSizeFor = (photoBytes: number, entries: number) => Math.ceil((photoBytes * 4) / 3) + entries * 90 + 200_000

/**
 * Décide ce que la sauvegarde complète peut contenir. Tout tient : tout part. Sinon les panoramas (jusqu'à 25 Mo par jardin) restent
 * dehors ; si les photos des plantes seules dépassent, la sauvegarde complète est refusée (la sauvegarde sans photos reste possible).
 */
export function planFull(m: Measure, wantPanoramas = true, limit = FULL_MAX_PHOTO_BYTES): FullPlan {
  const all = m.plantsBytes + m.panoramasBytes
  if (wantPanoramas && all <= limit) return { ok: true, withPanoramas: true, bytes: all, fileBytes: fileSizeFor(all, m.count) }
  if (m.plantsBytes <= limit) return { ok: true, withPanoramas: false, bytes: m.plantsBytes, fileBytes: fileSizeFor(m.plantsBytes, m.count) }
  return { ok: false, reason: 'trop-gros', bytes: m.plantsBytes }
}

// ---------- Encodage ----------

export async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(out)
}

export function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export interface BuiltBackup {
  blob: Blob
  photos: number
  missing: number
  bytes: number
}

/**
 * Construit le fichier : en-tête JSON, puis les images une par une (le fichier est assemblé en morceaux, jamais en une seule chaîne).
 * Une image absente est comptée mais ne bloque pas.
 */
export async function buildFullBackup(data: StateData, opts: { panoramas: boolean }, read: (id: string) => Promise<Blob | undefined> = getPhoto): Promise<BuiltBackup> {
  const refs = photoRefs(data)
  const ids = opts.panoramas ? [...refs.plants, ...refs.panoramas] : refs.plants
  const head = JSON.stringify({ ...serializeState(data, { panoramas: opts.panoramas }), kind: FULL_KIND }, null, 1)
  // On rouvre l'objet juste avant l'accolade finale pour y ajouter `photos`.
  const cut = head.lastIndexOf('}')
  const parts: BlobPart[] = [head.slice(0, cut).replace(/\s+$/, ''), ',\n "photos": {']
  let n = 0
  let missing = 0
  let bytes = 0
  for (const id of ids) {
    const b = await read(id)
    if (!b) {
      missing++
      continue
    }
    parts.push(`${n ? ',' : ''}\n  ${JSON.stringify(id)}: {"type": ${JSON.stringify(MIMES.has(b.type) ? b.type : 'image/jpeg')}, "data": "`, await blobToBase64(b), '"}')
    n++
    bytes += b.size
  }
  parts.push('\n }\n}\n')
  return { blob: new Blob(parts, { type: 'application/json' }), photos: n, missing, bytes }
}

export const fullBackupName = (d = new Date()) => `permajardin-complet-${isoDate(d)}.json`

const LAST_FULL_KEY = 'permajardin:last-full-export'

export function lastFullExportAt(): number | undefined {
  try {
    const n = Number(localStorage.getItem(LAST_FULL_KEY))
    return Number.isFinite(n) && n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

export function noteFullExport(now = Date.now()) {
  noteExportDone(now)
  try {
    localStorage.setItem(LAST_FULL_KEY, String(now))
  } catch {
    /* stockage indisponible */
  }
}

/** Télécharge le fichier. */
export function downloadFullBackup(b: BuiltBackup, name = fullBackupName()) {
  downloadBlob(b.blob, name)
}

// ---------- Lecture ----------

export interface FullRead {
  ok: true
  data: StateData
  warnings: string[]
  /** Images reprises (identifiant -> image), limitées à celles que les données citent. */
  photos: Map<string, Blob>
  /** Images du fichier refusées (format, taille) ou absentes. */
  skipped: number
}
export type FullReadResult = FullRead | Extract<MigrateResult, { ok: false }>

function checkImage(bytes: Uint8Array, type: string): boolean {
  if (bytes.length === 0 || bytes.length > MAX_ONE_PHOTO) return false
  const size = imageSize(bytes.subarray(0, 262_144))
  if (!size) return false
  if (!sizeWithinLimits(size, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)) return false
  // L'en-tête doit correspondre au type annoncé.
  return size.mime === type
}

/** Texte JSON -> données validées + images. Ne lève jamais d'exception. */
export function parseFullBackup(text: string): FullReadResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "ce fichier n'est pas une sauvegarde PermaJardin (JSON illisible)." }
  }
  const m = migrateState(raw)
  if (!m.ok) return m
  const photos = new Map<string, Blob>()
  let skipped = 0
  const rawPhotos = isRecord(raw) ? raw.photos : undefined
  if (isRecord(rawPhotos)) {
    const refs = photoRefs(m.data)
    const wanted = new Set([...refs.plants, ...refs.panoramas])
    for (const [id, entry] of Object.entries(rawPhotos)) {
      if (photos.size >= MAX_PHOTOS) break
      if (!isPhotoId(id) || !wanted.has(id)) {
        skipped++
        continue
      }
      if (!isRecord(entry) || typeof entry.data !== 'string' || typeof entry.type !== 'string' || !MIMES.has(entry.type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.data)) {
        skipped++
        continue
      }
      let bytes: Uint8Array
      try {
        bytes = base64ToBytes(entry.data)
      } catch {
        skipped++
        continue
      }
      if (!checkImage(bytes, entry.type)) {
        skipped++
        continue
      }
      photos.set(id, new Blob([bytes], { type: entry.type }))
    }
  }
  let data = m.data
  if (isRecord(rawPhotos)) {
    // Fichier complet : un point de vue dont les images manquent dans le fichier n'est pas repris (il s'ouvrirait vide).
    const cut = pruneMissingShots(data, photos)
    data = cut.data
    if (cut.removed > 0) m.warnings.push(`${cut.removed} point${cut.removed > 1 ? 's' : ''} de vue sans photos n’${cut.removed > 1 ? 'ont' : 'a'} pas été repris.`)
  }
  return { ok: true, data, warnings: m.warnings, photos, skipped }
}

/** Retire des points de vue les photos absentes de `have`, puis les points restés sans photo. */
export function pruneMissingShots(data: StateData, have: Map<string, Blob>): { data: StateData; removed: number } {
  let removed = 0
  const gardens = data.gardens.map((g) => {
    if (!g.panoramas) return g
    const kept = g.panoramas
      .map((p) => ({ ...p, shots: p.shots.filter((s) => have.has(s.photoId)) }))
      .filter((p) => {
        if (p.shots.length > 0) return true
        removed++
        return false
      })
    const { panoramas: _old, ...rest } = g
    return kept.length > 0 ? { ...rest, panoramas: kept } : rest
  })
  return { data: { ...data, gardens }, removed }
}

/** Fichier choisi -> données et images. La taille est vérifiée avant de lire le contenu. */
export async function readFullBackupFile(file: Pick<Blob, 'size' | 'text'>): Promise<FullReadResult> {
  if (file.size > FULL_MAX_FILE_BYTES) return { ok: false, error: `Fichier trop volumineux (${Math.round(FULL_MAX_FILE_BYTES / MB)} Mo maximum). Une sauvegarde PermaJardin est plus légère.` }
  try {
    return parseFullBackup(await file.text())
  } catch {
    return { ok: false, error: 'le fichier est illisible.' }
  }
}

/**
 * Range les images reprises dans l'appareil AVANT de remplacer les données.
 * Place insuffisante : rien n'est gardé de ce lot (les images déjà écrites sont retirées) et `StorageFullError` est levée.
 */
export async function restorePhotos(photos: Map<string, Blob>): Promise<number> {
  if (photos.size === 0) return 0
  let total = 0
  for (const b of photos.values()) total += b.size
  await ensureRoom(total)
  const written: string[] = []
  try {
    for (const [id, blob] of photos) {
      if (!id.startsWith(PHOTO_PREFIX)) continue
      await writeWithRetry(() => set(id, blob))
      written.push(id)
    }
  } catch (e) {
    for (const id of written) await del(id).catch(() => undefined)
    throw e
  }
  return written.length
}
