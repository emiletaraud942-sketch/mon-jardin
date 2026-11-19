import { LIMITS } from '../../lib/security/limits'
import type { Plant, XY } from '../../types'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import type { ScanItem } from './queue'

// Nouveau passage dans un jardin déjà cartographié : la plante scannée est souvent celle qui est déjà posée.
// Plutôt que d'en créer une deuxième au même endroit, on propose d'ajouter la photo à la plante existante (pur, testé).

/** Rayon (m) dans lequel une plante de même espèce est « la même ». */
export const SAME_PLANT_M = 1.5

export interface Twin {
  plant: Plant
  distanceM: number
  /** La plante peut encore recevoir une photo (20 au plus). */
  canAttach: boolean
}

const sameNameOrSpecies = (p: Plant, i: ScanItem) => {
  if (!i.speciesId) return false
  if (i.speciesId === UNKNOWN_SPECIES_ID) return p.speciesId === UNKNOWN_SPECIES_ID && !!i.customName && (p.customName ?? '').trim().toLowerCase() === i.customName.trim().toLowerCase()
  return p.speciesId === i.speciesId
}

/** La plante déjà posée la plus proche, de même espèce, à moins de `radiusM` de la position de l'élément. `undefined` si aucune. */
export function twinOf(plants: Plant[], item: ScanItem, radiusM = SAME_PLANT_M): Twin | undefined {
  if (item.accuracyM >= 99) return undefined // position inconnue : on ne devine pas
  let best: Twin | undefined
  for (const p of plants) {
    if (p.gardenId !== item.gardenId || p.id === item.plantId || !sameNameOrSpecies(p, item)) continue
    const d = Math.hypot(p.position.x - item.position.x, p.position.y - item.position.y)
    if (d <= radiusM && (!best || d < best.distanceM)) best = { plant: p, distanceM: d, canAttach: p.photos.length < LIMITS.photosPerPlant }
  }
  return best
}

export const distanceText = (m: number) => (m < 0.15 ? 'au même endroit' : `à ${m.toFixed(1).replace('.', ',')} m`)

/** Garde-fou : la position (x, y) est-elle valide pour comparer ? */
export const isPoint = (p: unknown): p is XY => !!p && typeof p === 'object' && Number.isFinite((p as XY).x) && Number.isFinite((p as XY).y)
