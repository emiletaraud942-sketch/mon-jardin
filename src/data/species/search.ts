import type { Species } from '../../types'

/** Minuscules, sans accents, « œ » devenu « oe » : « Œillet d’Inde » se trouve en tapant « oeillet ». */
export function normalizeSearch(s: string): string {
  return s
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Vrai si la requête figure dans le nom commun, le nom latin ou l'un des noms usuels (alias) de l'espèce. Requête vide : tout passe. */
export function matchesSpecies(s: Pick<Species, 'nomCommun' | 'nomLatin' | 'alias'>, query: string): boolean {
  const q = normalizeSearch(query)
  if (!q) return true
  return [s.nomCommun, s.nomLatin, ...(s.alias ?? [])].some((x) => normalizeSearch(x).includes(q))
}
