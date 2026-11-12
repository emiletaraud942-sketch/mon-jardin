// Synchronisation des PHOTOS (images) entre appareils, avec le compte en ligne (Supabase Storage, espace privé « photos »).
// Les photos sont déjà réduites et sans métadonnées (EXIF, GPS) : c'est cette copie qui est envoyée. Un dossier par utilisateur ; la base
// (migration 20261111000000) ne laisse chacun lire et écrire que son dossier, sans lien public ni accès anonyme.
//
// Ce module ne connaît pas le client Supabase global (pas d'import de `sync.ts`) : il reçoit le client et l'identifiant en argument, ce qui
// évite un import circulaire et rend la partie « décision » pure et testable (`planPhotoSync`).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPhoto, listPhotoIds, PHOTO_PREFIX, restorePhoto } from './photos'
import { LIMITS } from './security/limits'
import { imageSize, sizeWithinLimits } from './security/image'
import { isPhotoId } from './security/sanitize'
import { roomFor } from './space'
import type { Garden, Plant } from '../types'

export const PHOTO_BUCKET = 'photos'
/** Poids maximal d'une photo envoyée (octets) : le même que celui de l'espace en ligne (4 Mo). Au-delà, la photo reste sur l'appareil. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024
/**
 * Place maximale par utilisateur en ligne (octets). L'offre gratuite de Supabase offre 1 Go pour TOUS les utilisateurs : 80 Mo chacun laisse
 * de la place à une dizaine d'utilisateurs très chargés, ou à plus de cent usages normaux. Au-delà, les photos en trop restent sur l'appareil
 * (l'appli le dit) ; relever cette limite demande de passer à une offre payante.
 */
export const PHOTO_SYNC_CAP_BYTES = 80 * 1024 * 1024
/** Une photo en ligne que plus aucune donnée ne référence n'est effacée après ce délai (pas tout de suite : un autre appareil peut ne pas avoir fini). */
export const ORPHAN_AGE_MS = 7 * 24 * 3600 * 1000
const PAGE = 1000
const TIMEOUT_MS = 30_000

/** Nom du fichier en ligne : « <utilisateur>/<code>.jpg ». Un identifiant de photo invalide n'a pas de nom. */
export function objectName(userId: string, photoId: string): string | undefined {
  if (!isPhotoId(photoId) || !/^[0-9a-f-]{8,64}$/i.test(userId)) return undefined
  return `${userId}/${photoId.slice(PHOTO_PREFIX.length)}.jpg`
}

/** Identifiant de photo d'un nom de fichier du dossier de l'utilisateur (sans le dossier) ; `undefined` s'il n'a pas la forme attendue. */
export function photoIdOfFile(file: string): string | undefined {
  const m = /^([A-Za-z0-9]{1,64})\.jpg$/.exec(file)
  return m ? PHOTO_PREFIX + m[1] : undefined
}

export interface RemotePhoto {
  size: number
  /** Date de création (ms), si connue. */
  createdAt?: number
}

export interface PhotoPlan {
  /** À envoyer (présentes ici, absentes en ligne, dans la limite de place). */
  upload: string[]
  /** À récupérer (absentes ici, présentes en ligne). */
  download: string[]
  /** Présentes ici mais pas envoyées : plus de place en ligne, ou photo trop lourde. */
  skipped: string[]
  /** En ligne mais plus référencées, et anciennes : à effacer. */
  orphans: string[]
}

/**
 * Décide quoi envoyer, quoi récupérer et quoi effacer. Pur.
 * `wanted` : identifiants référencés par les données, dans l'ordre d'importance (les photos des plantes d'abord, les points de vue ensuite).
 * `local` : poids des photos présentes sur l'appareil. `remote` : photos en ligne.
 */
export function planPhotoSync(args: {
  wanted: string[]
  local: Map<string, number>
  remote: Map<string, RemotePhoto>
  capBytes?: number
  maxBytes?: number
  now?: number
  orphanAgeMs?: number
}): PhotoPlan {
  const { local, remote } = args
  const cap = args.capBytes ?? PHOTO_SYNC_CAP_BYTES
  const maxBytes = args.maxBytes ?? PHOTO_MAX_BYTES
  const now = args.now ?? Date.now()
  const age = args.orphanAgeMs ?? ORPHAN_AGE_MS
  const wanted = [...new Set(args.wanted.filter(isPhotoId))]
  const wantedSet = new Set(wanted)

  const orphans: string[] = []
  let used = 0
  for (const [id, r] of remote) {
    if (wantedSet.has(id)) used += r.size
    else if (r.createdAt !== undefined && now - r.createdAt > age) orphans.push(id)
    else used += r.size // récente ou de date inconnue : on la garde (et elle compte dans la place)
  }

  const upload: string[] = []
  const download: string[] = []
  const skipped: string[] = []
  for (const id of wanted) {
    const here = local.get(id)
    const there = remote.get(id)
    if (here === undefined) {
      if (there) download.push(id)
      continue
    }
    if (there) continue
    if (here > maxBytes || used + here > cap) {
      skipped.push(id)
      continue
    }
    used += here
    upload.push(id)
  }
  return { upload, download, skipped, orphans }
}

/** Photos que les données référencent, dans l'ordre d'importance : photos des plantes (journal compris), puis points de vue du jardin. */
export function wantedPhotoIds(plants: Pick<Plant, 'photos'>[], gardens: Pick<Garden, 'panoramas'>[]): string[] {
  const out: string[] = []
  for (const p of plants) out.push(...p.photos)
  for (const g of gardens) for (const pano of g.panoramas ?? []) for (const s of pano.shots) out.push(s.photoId)
  return [...new Set(out.filter(isPhotoId))]
}

export interface PhotoSyncResult {
  uploaded: number
  downloaded: number
  /** Restées sur l'appareil faute de place en ligne ou parce qu'elles sont trop lourdes. */
  skipped: number
  /** Qui n'ont pas pu partir ou arriver (réseau, refus, image invalide). */
  failed: number
  removed: number
}

function withTimeout<T>(p: PromiseLike<T>, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Le service met trop de temps à répondre.')), ms)
  })
  return Promise.race([Promise.resolve(p), limit]).finally(() => clearTimeout(timer))
}

/** Les fichiers du dossier de l'utilisateur, par page de 1 000. */
async function listRemote(sb: SupabaseClient, userId: string): Promise<Map<string, RemotePhoto>> {
  const out = new Map<string, RemotePhoto>()
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await withTimeout(sb.storage.from(PHOTO_BUCKET).list(userId, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }))
    if (error) throw new Error(error.message || 'La liste des photos en ligne est illisible.')
    const items = data ?? []
    for (const it of items) {
      const id = photoIdOfFile(it.name)
      if (!id) continue
      const size = Number((it.metadata as { size?: unknown } | null)?.size)
      const created = it.created_at ? Date.parse(it.created_at) : NaN
      out.set(id, { size: Number.isFinite(size) && size >= 0 ? size : 0, createdAt: Number.isFinite(created) ? created : undefined })
    }
    if (items.length < PAGE) break
  }
  return out
}

/** Une photo reçue est rangée seulement si c'est une vraie image, de taille raisonnable (jamais un fichier quelconque). */
async function isAcceptableImage(blob: Blob): Promise<boolean> {
  if (blob.size === 0 || blob.size > PHOTO_MAX_BYTES) return false
  const size = imageSize(new Uint8Array(await blob.slice(0, 262_144).arrayBuffer()))
  return !!size && sizeWithinLimits(size, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)
}

/**
 * Met les photos à jour dans les deux sens : récupère celles qui manquent ici, envoie celles qui manquent en ligne, efface les anciennes
 * orphelines en ligne. Une photo qui échoue n'empêche pas les autres. Ne lève que si la liste en ligne est illisible.
 */
export async function runPhotoSync(sb: SupabaseClient, userId: string, state: { gardens: Garden[]; plants: Plant[] }): Promise<PhotoSyncResult> {
  const res: PhotoSyncResult = { uploaded: 0, downloaded: 0, skipped: 0, failed: 0, removed: 0 }
  const wanted = wantedPhotoIds(state.plants, state.gardens)
  const remote = await listRemote(sb, userId)
  const have = new Set(await listPhotoIds())
  const local = new Map<string, number>()
  for (const id of wanted) {
    if (!have.has(id)) continue
    const blob = await getPhoto(id)
    if (blob) local.set(id, blob.size)
  }
  const plan = planPhotoSync({ wanted, local, remote })
  res.skipped = plan.skipped.length
  const bucket = sb.storage.from(PHOTO_BUCKET)

  for (const id of plan.download) {
    try {
      const name = objectName(userId, id)
      if (!name) continue
      const { data, error } = await withTimeout(bucket.download(name))
      if (error || !data) throw error ?? new Error('vide')
      if (!(await isAcceptableImage(data)) || !(await roomFor(data.size))) throw new Error('refusée')
      await restorePhoto(id, data)
      res.downloaded++
    } catch {
      res.failed++
    }
  }

  for (const id of plan.upload) {
    try {
      const name = objectName(userId, id)
      const blob = await getPhoto(id)
      if (!name || !blob) continue
      const sniff = imageSize(new Uint8Array(await blob.slice(0, 262_144).arrayBuffer()))
      if (!sniff || sniff.mime !== 'image/jpeg') {
        res.failed++ // l'espace en ligne n'accepte que du JPEG
        continue
      }
      const { error } = await withTimeout(bucket.upload(name, blob, { contentType: 'image/jpeg', upsert: false }))
      // « existe déjà » : un autre appareil vient de l'envoyer, c'est très bien.
      if (error && !/exist|duplicate/i.test(error.message)) throw error
      res.uploaded++
    } catch {
      res.failed++
    }
  }

  if (plan.orphans.length) {
    const names = plan.orphans.map((id) => objectName(userId, id)).filter((n): n is string => !!n)
    try {
      const { error } = await withTimeout(bucket.remove(names))
      if (!error) res.removed = names.length
    } catch {
      /* ce sera refait à la prochaine synchro */
    }
  }
  return res
}

/** Efface TOUTES les photos en ligne de l'utilisateur (droit à l'effacement : avant la suppression du compte ou de la copie en ligne). Lève en cas d'échec. */
export async function removeAllRemotePhotos(sb: SupabaseClient, userId: string): Promise<number> {
  const remote = await listRemote(sb, userId)
  const names = [...remote.keys()].map((id) => objectName(userId, id)).filter((n): n is string => !!n)
  const bucket = sb.storage.from(PHOTO_BUCKET)
  for (let i = 0; i < names.length; i += 100) {
    const { error } = await withTimeout(bucket.remove(names.slice(i, i + 100)))
    if (error) throw new Error('Les photos en ligne n’ont pas pu être effacées. Réessayez dans un instant.')
  }
  return names.length
}
