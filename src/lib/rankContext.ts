import { genusHint, isConfident, type RankContext } from './identifyRank'
import { getState } from './store'
import type { Identification } from './plantnet'

/** Rayon (m) dans lequel une plante déjà posée est « la même, vue de plus près » (nouveau passage dans un jardin déjà cartographié). */
export const NEAR_PLANT_M = 2

/** Espèces déjà plantées dans le jardin, et celles plantées juste à côté de la position scannée (elles passent devant dans le classement). */
export function rankContext(gardenId: string | undefined, position?: { x: number; y: number }): RankContext {
  const plants = getState().plants.filter((p) => p.gardenId === gardenId && p.speciesId)
  const near = position ? plants.filter((p) => Math.hypot(p.position.x - position.x, p.position.y - position.y) <= NEAR_PLANT_M) : []
  return { gardenSpeciesIds: new Set(plants.map((p) => p.speciesId as string)), nearSpeciesIds: new Set(near.map((p) => p.speciesId as string)) }
}

/** Sûr ou non, et la phrase de genre si l'incertitude est au niveau du genre. */
export function verdictOf(results: Identification[], ctx: RankContext): { uncertain?: boolean; hint?: string } {
  if (isConfident(results, ctx)) return {}
  return { uncertain: true, hint: genusHint(results) }
}
