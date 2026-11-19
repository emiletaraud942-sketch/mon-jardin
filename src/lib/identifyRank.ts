import type { Identification } from './plantnet'

// Reclassement des résultats Pl@ntNet avec ce que l'on sait du jardin (pur, testé). Pl@ntNet ne connaît ni notre catalogue
// ni les plantes déjà posées : une espèce de la base, et plus encore une espèce déjà dans le jardin, est plus probable
// qu'un arbre exotique à 7 %. Le score AFFICHÉ reste celui de Pl@ntNet : seul l'ordre change.

/** En dessous, on ne choisit rien d'office : « Je ne suis pas sûr ». */
export const CONFIDENT_SCORE = 0.3
/** Seuil plus bas quand l'espèce est déjà dans le jardin (la probabilité a priori est forte). */
export const CONFIDENT_IN_GARDEN = 0.2

const BOOST = { catalogue: 1.6, genre: 1.25, jardin: 1.5, voisine: 1.6 } as const
/** Seuil pour une espèce déjà plantée à moins de 2 m : on la revoit probablement. */
export const CONFIDENT_NEARBY = 0.12

export interface RankContext {
  /** Identifiants des espèces déjà plantées dans le jardin. */
  gardenSpeciesIds?: ReadonlySet<string>
  /** Espèces plantées à quelques mètres de l'endroit scanné (nouveau passage dans un jardin déjà cartographié). */
  nearSpeciesIds?: ReadonlySet<string>
}

const inGarden = (r: Identification, ctx: RankContext) => !!r.species && !r.approx && !!ctx.gardenSpeciesIds?.has(r.species.id)
const nearby = (r: Identification, ctx: RankContext) => !!r.species && !r.approx && !!ctx.nearSpeciesIds?.has(r.species.id)

/** Score pour le tri seulement (jamais montré). */
export function rankScore(r: Identification, ctx: RankContext = {}): number {
  let boost = 1
  if (r.species) boost *= r.approx ? BOOST.genre : BOOST.catalogue
  if (inGarden(r, ctx)) boost *= BOOST.jardin
  if (nearby(r, ctx)) boost *= BOOST.voisine
  return r.score * boost
}

/** Même liste, mieux ordonnée (tri stable : à égalité, l'ordre de Pl@ntNet est gardé). */
export function rerank(list: Identification[], ctx: RankContext = {}): Identification[] {
  return list.map((r, i) => ({ r, i, k: rankScore(r, ctx) })).sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.r)
}

/** Le premier résultat est-il assez sûr pour être proposé d'office ? */
export function isConfident(list: Identification[], ctx: RankContext = {}): boolean {
  const top = list[0]
  if (!top) return false
  return top.score >= CONFIDENT_SCORE || (inGarden(top, ctx) && top.score >= CONFIDENT_IN_GARDEN) || (nearby(top, ctx) && top.score >= CONFIDENT_NEARBY)
}

const genusOf = (latin: string) => latin.trim().split(/\s+/)[0] ?? ''

/**
 * Quand aucune espèce ne ressort mais que plusieurs espèces voisines se partagent la probabilité (typique en hiver :
 * un arbre sans feuilles), on l'avoue au niveau du genre : « Probablement du genre Prunus ». `undefined` sinon.
 */
export function genusHint(list: Identification[]): string | undefined {
  const byGenus = new Map<string, { total: number; n: number }>()
  for (const r of list) {
    const g = genusOf(r.latin)
    if (!g) continue
    const e = byGenus.get(g) ?? { total: 0, n: 0 }
    e.total += r.score
    e.n++
    byGenus.set(g, e)
  }
  let best: [string, { total: number; n: number }] | undefined
  for (const e of byGenus) if (!best || e[1].total > best[1].total) best = e
  if (!best || best[1].n < 2 || best[1].total < 0.45) return undefined
  return `Probablement du genre ${best[0]}`
}
