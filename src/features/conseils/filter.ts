import { CONSEIL_THEMES, type Conseil, type ConseilTheme } from '../../data/conseils'
import { matchesSpecies, normalizeSearch, searchRank } from '../../data/species/search'
import { usefulWords } from '../ravageurs/filter'

// Recherche et filtres des conseils « compost » et « économiser l'eau ». Module pur : la liste et le mois arrivent en paramètres.
// La normalisation (accents, « œ », pluriels) est celle de la recherche d'espèces : `matchesSpecies` et `searchRank`.

export interface ConseilFilter {
  query: string
  /** Pastilles de thème, en union : aucune = « Tout ». */
  themes: ConseilTheme[]
  /** Seulement ce qui sert ce mois-ci. Une fiche sans `mois` reste toujours visible. */
  thisMonth: boolean
}

export const NO_FILTER: ConseilFilter = { query: '', themes: [], thisMonth: false }

export const THEME_LABEL: Record<ConseilTheme, string> = Object.fromEntries(CONSEIL_THEMES.map((t) => [t.id, t.libelle])) as Record<ConseilTheme, string>

/** Ce que la recherche lit : le titre et les mots-clés (même forme qu'une espèce). */
const searchable = (c: Conseil) => ({ nomCommun: c.titre, nomLatin: '', alias: c.motsCles })

/**
 * Rang d'une fiche pour une requête : 0 titre exact, 1 mot-clé exact, 2 début, 3 contient,
 * 4 tous les mots y sont mais pas ensemble, 99 sans rapport. Requête vide : 0.
 */
export function conseilRank(c: Conseil, query: string): number {
  if (!normalizeSearch(query)) return 0
  const s = searchable(c)
  if (matchesSpecies(s, query)) return searchRank(s, query)
  const words = usefulWords(query)
  if (words.length > 1 && words.every((w) => matchesSpecies(s, w))) return 4
  return 99
}

/** Vrai si la fiche sert ce mois-ci (mois de 1 à 12) ; sans `mois`, elle sert toute l'année. */
export function servesMonth(c: Conseil, month: number): boolean {
  return !c.mois || c.mois.length === 0 || c.mois.includes(month)
}

/** Les fiches qui passent les filtres, la plus pertinente d'abord si l'on a tapé quelque chose (sinon l'ordre d'origine). */
export function filterConseils(list: readonly Conseil[], f: ConseilFilter, ctx: { month: number }): Conseil[] {
  const ranked = list
    .filter((c) => f.themes.length === 0 || f.themes.includes(c.theme))
    .filter((c) => !f.thisMonth || servesMonth(c, ctx.month))
    .map((c) => ({ c, rank: conseilRank(c, f.query) }))
    .filter((x) => x.rank < 99)
  if (!normalizeSearch(f.query)) return ranked.map((x) => x.c)
  return ranked.sort((a, b) => a.rank - b.rank || a.c.titre.localeCompare(b.c.titre, 'fr')).map((x) => x.c)
}

/** Nombre de fiches par thème (pour les tuiles). */
export function countByTheme(list: readonly Conseil[]): Record<ConseilTheme, number> {
  const out = { compost: 0, eau: 0 } as Record<ConseilTheme, number>
  for (const c of list) out[c.theme] += 1
  return out
}
