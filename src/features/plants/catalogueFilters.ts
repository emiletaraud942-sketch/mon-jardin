// Filtres du catalogue : cases à cocher, toutes combinées (ET). Pur : le mois et le jardin arrivent en paramètres.
import { plantingCalendar } from '../../engine/calendar'
import type { Garden, Month, Species } from '../../types'

export type FilterId = 'comestible' | 'melliferes' | 'ombre' | 'facile' | 'maintenant' | 'sans-risque'

export const FILTERS: { id: FilterId; label: string; help: string }[] = [
  { id: 'comestible', label: 'Comestible', help: 'Se mange (fruit, feuille, racine…)' },
  { id: 'melliferes', label: 'Utile aux abeilles', help: 'Mellifère : ses fleurs nourrissent les abeilles et les papillons' },
  { id: 'ombre', label: 'Ombre', help: 'Pousse à l’ombre ou à mi-ombre' },
  { id: 'facile', label: 'Facile', help: 'Rustique, peu d’eau, au plus 4 soins par an' },
  { id: 'maintenant', label: 'Ce mois-ci', help: 'À semer ou à planter ce mois-ci chez vous' },
  { id: 'sans-risque', label: 'Sans risque connu', help: 'Ni toxique, ni envahissante, ni épineuse, ni allergène' },
]

/** Facile : résiste à −10 °C, n'a pas soif, demande au plus 4 soins par an et n'est pas envahissante. */
export const isEasy = (s: Species) => s.rusticiteC <= -10 && s.eau !== 'eleve' && s.taches.length <= 4 && !s.avertissements?.some((a) => a.type === 'envahissante')

/** À semer ou à planter ce mois-ci, en tenant compte des dernières gelées du jardin. */
export function isSowableIn(s: Species, garden: Garden, month: Month): boolean {
  const c = plantingCalendar(s, garden)
  return [...c.semisAbri, ...c.semisPleineTerre, ...c.plantation].includes(month)
}

export function matches(s: Species, f: FilterId, garden: Garden, month: Month): boolean {
  switch (f) {
    case 'comestible':
      return s.comestible
    case 'melliferes':
      return !!s.mellifere
    case 'ombre':
      return s.soleil.includes('ombre') || s.soleil.includes('mi-ombre')
    case 'facile':
      return isEasy(s)
    case 'maintenant':
      return isSowableIn(s, garden, month)
    case 'sans-risque':
      return !s.avertissements?.length
  }
}

export function applyFilters(list: Species[], active: readonly FilterId[], garden: Garden, month: Month): Species[] {
  if (active.length === 0) return list
  return list.filter((s) => active.every((f) => matches(s, f, garden, month)))
}
