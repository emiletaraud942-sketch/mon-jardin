import type { Category, Species } from '../types'

/** Minuscules, sans accents, « œ » → oe, « æ » → ae, apostrophes et traits d'union → espace, espaces simples. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`\-‐‑–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Retire le « s » ou « x » final de chaque mot de plus de 2 lettres (pluriels : « framboises », « noix »). */
function singular(n: string): string {
  return n
    .split(' ')
    .map((w) => (w.length > 2 ? w.replace(/[sx]$/, '') : w))
    .join(' ')
}

/**
 * Recherche dans les fiches. Ordre : nom commun exact, alias exact, début du nom ou d'un alias,
 * puis contient (nom, alias, nom latin). À rang égal : ordre alphabétique.
 * La requête est essayée telle quelle et sans le s/x final de ses mots.
 */
export function searchIn(list: Species[], q: string, category?: Category | ''): Species[] {
  const raw = normalize(q)
  const variants = raw ? [...new Set([raw, singular(raw)])] : []
  const pool = list.filter((s) => !category || s.categorie === category)
  if (!variants.length) return pool // sans requête : l'ordre des fiches
  const ranked: { s: Species; rank: number; name: string }[] = []
  for (const s of pool) {
    const name = normalize(s.nomCommun)
    const aliases = (s.alias ?? []).map(normalize)
    const latin = normalize(s.nomLatin)
    let rank = 99
    for (const v of variants) {
      let r = 99
      if (name === v) r = 0
      else if (aliases.includes(v)) r = 1
      else if (name.startsWith(v) || aliases.some((a) => a.startsWith(v))) r = 2
      else if (name.includes(v) || aliases.some((a) => a.includes(v)) || latin.includes(v)) r = 3
      if (r < rank) rank = r
    }
    if (rank < 99) ranked.push({ s, rank, name })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'fr'))
  return ranked.map((x) => x.s)
}
