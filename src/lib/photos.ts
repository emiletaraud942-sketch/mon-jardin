import { del, get, keys, set } from 'idb-keyval'
import { uid } from './geo'
import { imageSize, sizeWithinLimits } from './security/image'
import { LIMITS } from './security/limits'
import { isPhotoId } from './security/sanitize'

export const PHOTO_PREFIX = 'photo:'
/** Cible par image : 5 photos en base64 (×1,37) doivent tenir sous les 4,5 Mo d'une fonction Vercel. */
export const TARGET_BYTES = 700 * 1024
const MAX_SIDE = 1280
const MIN_SIDE = 480
const QUALITIES = [0.82, 0.7, 0.58, 0.46]
const MESSAGE_FORMAT = 'Format de photo non pris en charge. Utilisez une photo JPEG ou PNG.'
const MESSAGE_TOO_BIG = 'Cette photo est trop grande pour être traitée sur cet appareil. Utilisez une photo de plus petite taille.'

/**
 * Refuse, avant tout décodage, un fichier démesuré ou dont l'en-tête annonce des dimensions absurdes
 * (une « bombe de décompression » : petit fichier PNG de 30 000 × 30 000 px qui saturerait la mémoire).
 */
async function assertDecodable(file: Blob): Promise<void> {
  if (file.size > LIMITS.photoInputBytes) throw new Error(MESSAGE_TOO_BIG)
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 262_144).arrayBuffer())
  } catch {
    return // lecture impossible : createImageBitmap tranchera
  }
  const size = imageSize(head)
  if (size && !sizeWithinLimits(size, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)) throw new Error(MESSAGE_TOO_BIG)
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("La photo n'a pas pu être compressée. Réessayez avec une autre image."))), type, quality),
  )
}

async function decode(file: Blob): Promise<ImageBitmap> {
  await assertDecodable(file)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // HEIC/HEIF, fichier corrompu, type non image…
    throw new Error(MESSAGE_FORMAT)
  }
  if (!sizeWithinLimits(bitmap, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)) {
    bitmap.close?.()
    throw new Error(MESSAGE_TOO_BIG)
  }
  return bitmap
}

/**
 * Encode une image en JPEG en visant `targetBytes` : qualité décroissante, puis réduction des dimensions.
 * Renvoie le meilleur résultat obtenu même si la cible n'est pas atteinte (plancher de qualité et de taille).
 */
export async function compressToTarget(file: Blob, opts: { maxSide?: number; targetBytes?: number; qualities?: number[] } = {}): Promise<Blob> {
  const { maxSide = MAX_SIDE, targetBytes = TARGET_BYTES, qualities = QUALITIES } = opts
  const bitmap = await decode(file)
  try {
    let side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error("La photo n'a pas pu être traitée sur cet appareil.")
    let best: Blob | undefined
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      for (const q of qualities) {
        const blob = await toBlob(canvas, 'image/jpeg', q)
        if (!best || blob.size < best.size) best = blob
        if (blob.size <= targetBytes) return blob
      }
      if (side <= MIN_SIDE) break
      side = Math.max(MIN_SIDE, Math.round(side * 0.8))
    }
    return best!
  } finally {
    bitmap.close?.()
  }
}

/**
 * Réduit une photo (par défaut max 1280 px, < 700 ko ; `opts` pour une autre cible) et la stocke dans IndexedDB. Renvoie son id.
 * Vie privée : la photo est redessinée sur un canvas puis ré-encodée en JPEG, ce qui supprime EXIF, GPS, XMP et miniature
 * (prouvé par un test navigateur, voir docs/SECURITE.md). C'est toujours cette copie qui est stockée et envoyée à Pl@ntNet.
 */
export async function savePhoto(file: Blob, opts?: { maxSide?: number; targetBytes?: number; qualities?: number[] }): Promise<string> {
  const blob = await compressToTarget(file, opts)
  const id = PHOTO_PREFIX + uid()
  await set(id, blob)
  return id
}

/** Lit une photo. Un identifiant qui n'a pas la forme « photo:… » est refusé : on ne lit jamais une autre clé IndexedDB (l'état, la sauvegarde…). */
export async function getPhoto(id: string): Promise<Blob | undefined> {
  if (!isPhotoId(id)) return undefined
  const v = await get(id)
  return v instanceof Blob ? v : undefined
}

/** Supprime une photo. Identifiant invalide : sans effet (jamais d'effacement d'une autre clé). */
export async function deletePhoto(id: string) {
  if (!isPhotoId(id)) return
  await del(id)
}

/** Ids de toutes les photos stockées (pour le nettoyage des orphelines). */
export async function listPhotoIds(): Promise<string[]> {
  return (await keys()).filter((k): k is string => isPhotoId(k))
}
