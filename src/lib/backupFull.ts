import { isoDate } from './dates'
import { markExported, saveBackupBlob, type SaveOutcome } from './backup'
import { getPhoto, restorePhoto } from './photos'
import { migrateState, serializeState, type StateData } from './migrate'
import { LIMITS } from './security/limits'
import { imageSize, sizeWithinLimits } from './security/image'
import { isPhotoId } from './security/sanitize'
import { getState, panoramaPhotoIds } from './store'
import type { Panorama } from '../types'

// Sauvegarde complète : l'état (comme la sauvegarde simple) ET les photos, dans un seul fichier. Rien n'est envoyé nulle part.
//
// Format du fichier :
//   « PERMAJARDIN-COMPLET-1\n »            (signature)
//   longueur de l'en-tête sur 10 chiffres + « \n »
//   en-tête JSON (UTF-8) : { format, version, exportedAt, state, panoramas, photos: [{ id, type, size }] }
//   octets des photos, bout à bout, dans l'ordre de `photos`
// Les photos ne sont jamais lues en entier en mémoire : à l'export, le fichier est un Blob de morceaux ; à l'import,
// chaque photo est lue par tranche (Blob.slice) puis rangée dans IndexedDB.

export const FULL_MAGIC = 'PERMAJARDIN-COMPLET-1\n'
export const FULL_EXTENSION = '.permajardin'
const LEN_DIGITS = 10
const PREFIX_BYTES = FULL_MAGIC.length + LEN_DIGITS + 1

interface PhotoEntry {
  id: string
  type: string
  size: number
}

export interface FullBackup {
  blob: Blob
  photos: number
  /** Photos référencées mais absentes de l'appareil (non exportées). */
  missing: number
}

/** Au-delà de cette taille, on conseille le Wi-Fi et de la place libre : le fichier est lourd à écrire et à relire. */
export const HEAVY_BACKUP_BYTES = 100 * 1024 * 1024

/** Message si la sauvegarde dépasse ce que l'appli accepte de relire : mieux vaut refuser maintenant que créer un fichier inutilisable. */
export const MESSAGE_TOO_HEAVY = (mo: number) =>
  `Les photos pèsent ${mo} Mo : c’est plus que les ${Math.round(LIMITS.fullBackupBytes / (1024 * 1024))} Mo qu’un seul fichier peut contenir. Supprimez quelques photos, ou faites la sauvegarde simple (sans photos).`

/** Nombre et poids des photos qui entreraient dans une sauvegarde complète (sans rien lire : on ne regarde que la taille). */
export async function estimateFullBackup(): Promise<{ photos: number; bytes: number; tooHeavy: boolean }> {
  const { gardens, plants } = getState()
  const ids = [...new Set([...plants.flatMap((p) => p.photos), ...panoramaPhotoIds(gardens)])]
  let photos = 0
  let bytes = 0
  for (const id of ids) {
    const blob = await getPhoto(id)
    if (!blob) continue
    photos++
    bytes += blob.size
  }
  return { photos, bytes, tooHeavy: bytes + 2_000_000 > LIMITS.fullBackupBytes } // 2 Mo de marge pour l'en-tête
}

/** Fabrique la sauvegarde complète de l'état courant. */
export async function buildFullBackup(): Promise<FullBackup> {
  const { gardens, plants, tasksDone } = getState()
  const ids = [...new Set([...plants.flatMap((p) => p.photos), ...panoramaPhotoIds(gardens)])]
  const entries: PhotoEntry[] = []
  const blobs: Blob[] = []
  let missing = 0
  for (const id of ids) {
    const blob = await getPhoto(id)
    if (!blob) {
      missing++
      continue
    }
    entries.push({ id, type: blob.type || 'image/jpeg', size: blob.size })
    blobs.push(blob)
  }
  const panoramas: Record<string, Panorama[]> = {}
  for (const g of gardens) if (g.panoramas?.length) panoramas[g.id] = g.panoramas
  const header = { format: 'permajardin-complet', version: 1, exportedAt: new Date().toISOString(), state: serializeState({ gardens, plants, tasksDone }), panoramas, photos: entries }
  const head = new TextEncoder().encode(JSON.stringify(header))
  const prefix = `${FULL_MAGIC}${String(head.length).padStart(LEN_DIGITS, '0')}\n`
  return { blob: new Blob([prefix, head, ...blobs], { type: 'application/octet-stream' }), photos: entries.length, missing }
}

/** Le fichier commence-t-il par la signature de la sauvegarde complète ? (lit 22 octets seulement) */
export async function isFullBackup(file: Pick<Blob, 'slice'>): Promise<boolean> {
  try {
    return (await file.slice(0, FULL_MAGIC.length).text()) === FULL_MAGIC
  } catch {
    return false
  }
}

export interface PhotoToRestore {
  id: string
  /** Tranche du fichier : lue seulement au moment de ranger la photo. */
  blob: Blob
}

export type FullRead =
  | { ok: true; data: StateData; warnings: string[]; photos: PhotoToRestore[]; skipped: number }
  | { ok: false; error: string }

const fail = (error: string): FullRead => ({ ok: false, error })
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Lit et valide une sauvegarde complète. Ne lève jamais d'exception ; ne range rien : voir `restorePhotos`. */
export async function readFullBackup(file: Pick<Blob, 'size' | 'slice'>): Promise<FullRead> {
  if (file.size > LIMITS.fullBackupBytes) return fail(`fichier trop volumineux (${Math.round(LIMITS.fullBackupBytes / (1024 * 1024))} Mo maximum).`)
  try {
    const prefix = await file.slice(0, PREFIX_BYTES).text()
    if (!prefix.startsWith(FULL_MAGIC)) return fail("ce fichier n'est pas une sauvegarde complète PermaJardin.")
    const lenText = prefix.slice(FULL_MAGIC.length, FULL_MAGIC.length + LEN_DIGITS)
    const headLen = /^\d{10}$/.test(lenText) ? Number(lenText) : -1
    if (headLen <= 0 || headLen > LIMITS.importBytes || PREFIX_BYTES + headLen > file.size) return fail('le fichier est incomplet ou abîmé.')
    let header: unknown
    try {
      header = JSON.parse(await file.slice(PREFIX_BYTES, PREFIX_BYTES + headLen).text())
    } catch {
      return fail('le fichier est illisible (en-tête abîmé).')
    }
    if (!isRec(header) || header.format !== 'permajardin-complet') return fail("ce fichier n'est pas une sauvegarde complète PermaJardin.")
    if (typeof header.version === 'number' && header.version > 1) return fail("cette sauvegarde vient d'une version plus récente de PermaJardin. Mettez l'application à jour.")
    if (!Array.isArray(header.photos) || header.photos.length > LIMITS.fullBackupPhotos) return fail('la liste des photos est invalide ou trop longue.')

    // Liste des photos : forme, tailles, et somme exacte égale à ce qui reste dans le fichier.
    const entries: PhotoEntry[] = []
    let total = 0
    for (const e of header.photos) {
      if (!isRec(e) || !isPhotoId(e.id) || typeof e.size !== 'number' || !Number.isInteger(e.size) || e.size <= 0 || e.size > LIMITS.fullBackupPhotoBytes) return fail('la liste des photos est invalide.')
      entries.push({ id: e.id, type: typeof e.type === 'string' ? e.type : '', size: e.size })
      total += e.size
    }
    if (PREFIX_BYTES + headLen + total !== file.size) return fail('le fichier est incomplet ou a été modifié.')

    // État : les points de vue en photos voyagent à part, puis passent par la même validation que tout import.
    const state = isRec(header.state) ? { ...header.state } : undefined
    if (!state || !Array.isArray(state.gardens)) return fail('aucun jardin trouvé dans ce fichier.')
    const panos = isRec(header.panoramas) ? header.panoramas : {}
    state.gardens = state.gardens.map((g) => (isRec(g) && typeof g.id === 'string' && Array.isArray(panos[g.id]) ? { ...g, panoramas: panos[g.id] } : g))
    const migrated = migrateState(state)
    if (!migrated.ok) return fail(migrated.error)

    // Photos : seulement celles que les données gardées référencent, et seulement de vraies images de taille raisonnable.
    const referenced = new Set([...migrated.data.plants.flatMap((p) => p.photos), ...panoramaPhotoIds(migrated.data.gardens)])
    const photos: PhotoToRestore[] = []
    let skipped = 0
    let offset = PREFIX_BYTES + headLen
    for (const e of entries) {
      const slice = file.slice(offset, offset + e.size)
      offset += e.size
      if (!referenced.has(e.id)) continue
      const size = imageSize(new Uint8Array(await slice.slice(0, 262_144).arrayBuffer()))
      if (!size || !sizeWithinLimits(size, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)) {
        skipped++
        continue
      }
      photos.push({ id: e.id, blob: slice.slice(0, e.size, size.mime) })
    }
    return { ok: true, data: migrated.data, warnings: migrated.warnings, photos, skipped }
  } catch {
    return fail('le fichier est illisible.')
  }
}

/** Range les photos d'une sauvegarde complète lue. Renvoie le nombre de photos rangées ; une erreur de stockage est relancée. */
export async function restorePhotos(photos: PhotoToRestore[]): Promise<number> {
  let n = 0
  for (const p of photos) {
    await restorePhoto(p.id, p.blob)
    n++
  }
  return n
}

/** Fabrique la sauvegarde complète et la range (menu « Partager » sur téléphone, sinon téléchargement). Refuse (message clair) si le fichier dépasserait ce que l'appli sait relire. */
export async function downloadFullBackup(prefix = 'permajardin-complet', opts: { share?: boolean } = {}): Promise<FullBackup & { outcome: SaveOutcome }> {
  const out = await buildFullBackup()
  if (out.blob.size > LIMITS.fullBackupBytes) throw new Error(MESSAGE_TOO_HEAVY(Math.round(out.blob.size / (1024 * 1024))))
  const outcome = await saveBackupBlob(out.blob, `${prefix}-${isoDate()}${FULL_EXTENSION}`, { share: opts.share })
  if (outcome.how !== 'annule') markExported(Date.now(), outcome.name)
  return { ...out, outcome }
}

/** « 85 Mo » ou « 0,4 Mo » : taille lisible. */
export function formatMo(bytes: number): string {
  const mo = bytes / (1024 * 1024)
  return `${(mo >= 10 ? Math.round(mo) : Math.round(mo * 10) / 10).toLocaleString('fr-FR')} Mo`
}
