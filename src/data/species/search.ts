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

/** Retire le « s » ou « x » final de chaque mot de plus de 2 lettres : « framboises » → « framboise », « noix » → « noi ». */
function singular(n: string): string {
  return n
    .split(' ')
    .map((w) => (w.length > 2 ? w.replace(/[sx]$/, '') : w))
    .join(' ')
}

/** La requête normalisée, puis la même sans le s/x final de ses mots (pluriels). Vide si la requête est vide. */
function variants(query: string): string[] {
  const q = normalizeSearch(query)
  return q ? [...new Set([q, singular(q)])] : []
}

/** Vrai si la requête (ou son singulier) figure dans le nom commun, le nom latin ou l'un des noms usuels (alias) de l'espèce. Requête vide : tout passe. */
export function matchesSpecies(s: Pick<Species, 'nomCommun' | 'nomLatin' | 'alias'>, query: string): boolean {
  const vs = variants(query)
  if (vs.length === 0) return true
  const names = [s.nomCommun, s.nomLatin, ...(s.alias ?? [])].map(normalizeSearch)
  return vs.some((v) => names.some((n) => n.includes(v)))
}

/**
 * Rang d'une espèce pour une requête : 0 nom commun exact, 1 alias exact, 2 début du nom ou d'un alias,
 * 3 contient (nom, alias, nom latin), 99 ne correspond pas. La requête est essayée telle quelle et au singulier.
 */
export function searchRank(s: Pick<Species, 'nomCommun' | 'nomLatin' | 'alias'>, query: string): number {
  const vs = variants(query)
  if (vs.length === 0) return 0
  const name = normalizeSearch(s.nomCommun)
  const aliases = (s.alias ?? []).map(normalizeSearch)
  const latin = normalizeSearch(s.nomLatin)
  let rank = 99
  for (const v of vs) {
    let r = 99
    if (name === v) r = 0
    else if (aliases.includes(v)) r = 1
    else if (name.startsWith(v) || aliases.some((a) => a.startsWith(v))) r = 2
    else if (name.includes(v) || aliases.some((a) => a.includes(v)) || latin.includes(v)) r = 3
    rank = Math.min(rank, r)
  }
  return rank
}

/** Trie les espèces qui correspondent : exact, alias, début, contient ; à rang égal, ordre alphabétique. Sans requête : ordre d'origine. */
export function sortByRelevance<T extends Pick<Species, 'nomCommun' | 'nomLatin' | 'alias'>>(list: T[], query: string): T[] {
  if (variants(query).length === 0) return list
  return list
    .map((s) => ({ s, rank: searchRank(s, query), name: normalizeSearch(s.nomCommun) }))
    .filter((x) => x.rank < 99)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'fr'))
    .map((x) => x.s)
}
