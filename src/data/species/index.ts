import type { Species } from '../../types'
import { LEGUMES } from './legumes'
import { AROMATIQUES } from './aromatiques'
import { FLEURS } from './fleurs'
import { VIVACES } from './vivaces'
import { PETITS_FRUITS } from './petits-fruits'
import { FRUITIERS } from './fruitiers'
import { ARBRES_HAIES } from './arbres-haies'
import { AJOUTS } from './ajouts'
import { ALIAS } from './alias'
import { AVERTISSEMENTS } from './avertissements'

export const SPECIES: Species[] = [
  ...LEGUMES,
  ...AROMATIQUES,
  ...FLEURS,
  ...VIVACES,
  ...PETITS_FRUITS,
  ...FRUITIERS,
  ...ARBRES_HAIES,
  ...AJOUTS,
]
  .map((s) => ({ ...s, ...(ALIAS[s.id] ? { alias: ALIAS[s.id] } : {}), ...(AVERTISSEMENTS[s.id] ? { avertissements: AVERTISSEMENTS[s.id] } : {}) }))
  .sort((a, b) => a.nomCommun.localeCompare(b.nomCommun, 'fr'))

// Sans prototype : `SPECIES_BY_ID['constructor']` ou `['toString']` (identifiant venu d'une annonce d'un autre membre, d'un import ou
// d'une synchro) renvoie `undefined`, jamais une fonction d'Object.
export const SPECIES_BY_ID: Record<string, Species> = Object.assign(Object.create(null), Object.fromEntries(SPECIES.map((s) => [s.id, s])))

export function getSpecies(id: string): Species | undefined {
  return SPECIES_BY_ID[id]
}

export { matchesSpecies, normalizeSearch } from './search'
