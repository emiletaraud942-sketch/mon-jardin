import type { Ennui, EnnuiType } from '../../data/ravageurs/types'
import { matchesSpecies, normalizeSearch, searchRank } from '../../data/species/search'
import { MONTH_NAMES } from '../../engine/calendar'

// Recherche et filtres du guide « bestioles et maladies ». Module pur : la liste, le mois et les plantes du jardin arrivent en paramètres.
// La normalisation (accents, « œ », pluriels) est celle de la recherche d'espèces : `matchesSpecies` et `searchRank`.

export type EnnuiGroup = 'insectes' | 'champignons' | 'animaux' | 'autres'

export interface GroupInfo {
  id: EnnuiGroup
  /** Libellé de la pastille : des mots simples. */
  label: string
  types: EnnuiType[]
}

export const GROUPS: GroupInfo[] = [
  { id: 'insectes', label: 'Insectes', types: ['insecte'] },
  { id: 'champignons', label: 'Champignons', types: ['champignon'] },
  { id: 'animaux', label: 'Limaces et animaux', types: ['mollusque', 'animal'] },
  { id: 'autres', label: 'Autres', types: ['autre'] },
]

export const TYPE_LABEL: Record<EnnuiType, string> = {
  insecte: 'Insecte',
  champignon: 'Champignon (maladie)',
  mollusque: 'Limace ou escargot',
  animal: 'Animal',
  autre: 'Autre cause',
}

export interface EnnuiFilter {
  query: string
  /** Pastilles de type, en union : aucune = tous les types. */
  groups: EnnuiGroup[]
  /** Seulement ce qui se voit ce mois-ci. */
  thisMonth: boolean
  /** Seulement ce qui touche les plantes du jardin. Sans effet si le jardin n'a aucune plante. */
  mine: boolean
}

export const NO_FILTER: EnnuiFilter = { query: '', groups: [], thisMonth: false, mine: false }

export interface EnnuiContext {
  /** Mois d'aujourd'hui, de 1 à 12. */
  month: number
  /** `speciesId` des plantes du jardin actuel. */
  speciesIds: ReadonlySet<string>
}

/** Ce que la recherche lit : le nom, les noms usuels et les mots de symptôme (même forme qu'une espèce). */
const searchable = (e: Ennui) => ({ nomCommun: e.nom, nomLatin: '', alias: [...e.alias, ...e.signesMots] })

const STOP = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'un', 'une', 'sur', 'dans', 'en', 'au', 'aux', 'et', 'ou', 'd', 'l', 'mes', 'ma', 'mon'])

/** Mots utiles de la requête (sans les petits mots de liaison). */
export function usefulWords(query: string): string[] {
  return normalizeSearch(query)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
}

/**
 * Rang d'une fiche pour une requête : 0 nom exact, 1 nom usuel ou symptôme exact, 2 début, 3 contient,
 * 4 tous les mots y sont mais pas ensemble (« brunes taches »), 99 sans rapport. Requête vide : 0.
 */
export function ennuiRank(e: Ennui, query: string): number {
  if (!normalizeSearch(query)) return 0
  const s = searchable(e)
  if (matchesSpecies(s, query)) return searchRank(s, query)
  const words = usefulWords(query)
  if (words.length > 1 && words.every((w) => matchesSpecies(s, w))) return 4
  return 99
}

/** Vrai si la plante d'un des `planteIds` est dans le jardin. */
export function touchesMyPlants(e: Ennui, speciesIds: ReadonlySet<string>): boolean {
  return e.planteIds.some((id) => speciesIds.has(id))
}

/** Les fiches qui passent les filtres, la plus pertinente d'abord si l'on a tapé quelque chose (sinon l'ordre d'origine). */
export function filterEnnuis(list: readonly Ennui[], f: EnnuiFilter, ctx: EnnuiContext): Ennui[] {
  const types = new Set(f.groups.flatMap((g) => GROUPS.find((x) => x.id === g)?.types ?? []))
  const mine = f.mine && ctx.speciesIds.size > 0
  const ranked = list
    .filter((e) => types.size === 0 || types.has(e.type))
    .filter((e) => !f.thisMonth || e.mois.includes(ctx.month))
    .filter((e) => !mine || touchesMyPlants(e, ctx.speciesIds))
    .map((e) => ({ e, rank: ennuiRank(e, f.query) }))
    .filter((x) => x.rank < 99)
  if (!normalizeSearch(f.query)) return ranked.map((x) => x.e)
  return ranked.sort((a, b) => a.rank - b.rank || a.e.nom.localeCompare(b.e.nom, 'fr')).map((x) => x.e)
}

/** Les fiches qui touchent une espèce (pour la ligne « Ennuis fréquents » de sa fiche). */
export function ennuisForSpecies(list: readonly Ennui[], speciesId: string): Ennui[] {
  return list.filter((e) => e.planteIds.includes(speciesId))
}

/** Mois en toutes lettres : « d’avril à septembre », « toute l’année », ou la liste si les mois ne se suivent pas. */
export function monthsText(mois: readonly number[]): string {
  const set = new Set(mois.filter((m) => m >= 1 && m <= 12))
  if (set.size === 0) return ''
  if (set.size === 12) return 'toute l’année'
  const name = (m: number) => MONTH_NAMES[m - 1].toLowerCase()
  const prev = (m: number) => (m === 1 ? 12 : m - 1)
  const next = (m: number) => (m === 12 ? 1 : m + 1)
  const starts = [...set].filter((m) => !set.has(prev(m)))
  if (starts.length === 1) {
    const from = starts[0]
    let to = from
    while (set.has(next(to))) to = next(to)
    if (from === to) return `en ${name(from)}`
    const de = /^[aeiouhéèêîôû]/i.test(name(from)) ? 'd’' : 'de '
    return `${de}${name(from)} à ${name(to)}`
  }
  const names = [...set].sort((a, b) => a - b).map(name)
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`
}
