// Points de vue en photos : écriture dans l'état (métadonnées) et dans IndexedDB (photos). Rien ne quitte l'appareil.
import { deletePhoto, getPhoto } from '../../lib/photos'
import { getState, updateGarden } from '../../lib/store'
import type { Garden, Panorama } from '../../types'

export const panoramasOf = (garden: Garden | undefined): Panorama[] => garden?.panoramas ?? []

const currentOf = (gardenId: string): Panorama[] => getState().gardens.find((g) => g.id === gardenId)?.panoramas ?? []

/** Poids (octets) des photos d'un point. Une photo absente compte pour 0. */
export async function pointBytes(p: Panorama): Promise<number> {
  let n = 0
  for (const s of p.shots) n += (await getPhoto(s.photoId))?.size ?? 0
  return n
}

export async function usedBytes(list: Panorama[]): Promise<number> {
  let n = 0
  for (const p of list) n += await pointBytes(p)
  return n
}

function write(gardenId: string, list: Panorama[]) {
  updateGarden(gardenId, { panoramas: list.length > 0 ? list : undefined })
}

/** Ajoute un point, ou remplace celui de même identifiant (« Refaire ce point ») en effaçant les anciennes photos. */
export function savePoint(gardenId: string, point: Panorama) {
  const list = currentOf(gardenId)
  const old = list.find((p) => p.id === point.id)
  write(gardenId, old ? list.map((p) => (p.id === point.id ? point : p)) : [...list, point])
  if (old) {
    const keep = new Set(point.shots.map((s) => s.photoId))
    for (const s of old.shots) if (!keep.has(s.photoId)) void deletePhoto(s.photoId).catch(() => undefined)
  }
}

/** Supprime un point et ses photos. */
export function removePoint(gardenId: string, id: string) {
  const list = currentOf(gardenId)
  const old = list.find((p) => p.id === id)
  if (!old) return
  write(gardenId, list.filter((p) => p.id !== id))
  for (const s of old.shots) void deletePhoto(s.photoId).catch(() => undefined)
}

/** Efface des photos déjà enregistrées pour un point abandonné. */
export function discardPhotos(ids: string[]) {
  for (const id of ids) void deletePhoto(id).catch(() => undefined)
}
