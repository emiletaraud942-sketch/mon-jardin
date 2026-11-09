import type { Conseil, ConseilTheme } from './types'
import { COMPOST } from './compost'
import { EAU } from './eau'

export type { Conseil, ConseilTheme } from './types'

/** Libellés des deux guides, dans l'ordre d'affichage. */
export const CONSEIL_THEMES: { id: ConseilTheme; libelle: string }[] = [
  { id: 'compost', libelle: 'Compost' },
  { id: 'eau', libelle: 'Économiser l’eau' },
]

/** Toutes les fiches : compost d'abord, puis eau, dans l'ordre de lecture voulu. */
export const CONSEILS: Conseil[] = [...COMPOST, ...EAU]

// Sans prototype : un identifiant venu d'ailleurs (lien, import) ne renvoie jamais une fonction d'Object.
export const CONSEILS_BY_ID: Record<string, Conseil> = Object.assign(Object.create(null), Object.fromEntries(CONSEILS.map((c) => [c.id, c])))

export function getConseil(id: string): Conseil | undefined {
  return CONSEILS_BY_ID[id]
}
