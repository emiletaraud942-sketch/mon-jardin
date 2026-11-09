import type { Ennui } from './types'
import { INSECTES } from './insectes'
import { CHAMPIGNONS } from './champignons'
import { MOLLUSQUES_ANIMAUX_AUTRES } from './mollusques-animaux-autres'

export type { Ennui, EnnuiType } from './types'

export const ENNUIS: Ennui[] = [...INSECTES, ...CHAMPIGNONS, ...MOLLUSQUES_ANIMAUX_AUTRES].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

// Sans prototype : un identifiant venu d'ailleurs (lien, import) ne renvoie jamais une fonction d'Object.
export const ENNUIS_BY_ID: Record<string, Ennui> = Object.assign(Object.create(null), Object.fromEntries(ENNUIS.map((e) => [e.id, e])))

export function getEnnui(id: string): Ennui | undefined {
  return ENNUIS_BY_ID[id]
}
