import { distance } from '../../lib/geo'
import { UNKNOWN_SPECIES_ID } from '../../lib/customName'
import type { Queue, ScanItem } from './queue'

// Regroupement des doublons : une même plante filmée sous plusieurs images (pur, testé).
// Les images sans position connue (vidéo importée, précision 99) ne sont jamais regroupées.

export const DUPLICATE_RADIUS_M = 2

/** Clé d'espèce d'un élément : l'espèce de la base, ou le nom libre. `undefined` si rien n'est choisi. */
export function speciesKey(i: ScanItem): string | undefined {
  if (!i.speciesId) return undefined
  if (i.speciesId === UNKNOWN_SPECIES_ID) return i.customName ? 'nom:' + i.customName.trim().toLowerCase() : undefined
  return i.speciesId
}

const score = (i: ScanItem) => i.suggestions[0]?.score ?? 0

/**
 * Parmi les images de vidéo « à valider », regroupe celles de même espèce à moins de `radiusM` mètres.
 * La mieux notée est gardée ; les autres passent « ignorées » avec `mergedInto`. Les éléments déjà revus à la main ne sont pas touchés.
 */
export function dedupeQueue(q: Queue, radiusM = DUPLICATE_RADIUS_M): Queue {
  const candidates = q.filter((i) => i.from === 'video' && i.status === 'a-valider' && i.accuracyM < 99 && speciesKey(i)).sort((a, b) => score(b) - score(a))
  const kept: ScanItem[] = []
  const merged = new Map<string, string>()
  for (const i of candidates) {
    const twin = kept.find((k) => speciesKey(k) === speciesKey(i) && k.gardenId === i.gardenId && distance(k.position, i.position) < radiusM)
    if (twin) merged.set(i.id, twin.id)
    else kept.push(i)
  }
  if (merged.size === 0) return q
  return q.map((i) => (merged.has(i.id) ? { ...i, status: 'ignoree' as const, mergedInto: merged.get(i.id) } : i))
}

/** Nombre de doublons regroupés dans un jardin. */
export const mergedCount = (q: Queue, gardenId: string) => q.filter((i) => i.gardenId === gardenId && i.mergedInto).length
