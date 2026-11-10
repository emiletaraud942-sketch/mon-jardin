import type { Lecon, Niveau, NiveauInfo } from './types'
import { COMPRENDRE } from './comprendre'
import { PREPARER } from './preparer'
import { CULTIVER } from './cultiver'
import { VIVANT } from './vivant'

export type { Lecon, Niveau, NiveauInfo, QuizQuestion, Essayer } from './types'

/** Les quatre niveaux, dans l'ordre du parcours. */
export const NIVEAUX: NiveauInfo[] = [
  { id: 'comprendre', libelle: 'Comprendre', resume: 'Regarder son jardin, son sol et son climat avant de planter.' },
  { id: 'preparer', libelle: 'Préparer', resume: 'Organiser le jardin, nourrir le sol et bien gérer l’eau.' },
  { id: 'cultiver', libelle: 'Cultiver', resume: 'Semer, entretenir, faire tourner les cultures et tailler.' },
  { id: 'vivant', libelle: 'Un jardin vivant', resume: 'Accueillir la vie, garder le jardin en bonne santé, suivre les saisons.' },
]

/** Toutes les leçons, triées par ordre de lecture. */
export const LECONS: Lecon[] = [...COMPRENDRE, ...PREPARER, ...CULTIVER, ...VIVANT].sort((a, b) => a.ordre - b.ordre)

// Sans prototype : un identifiant venu d'ailleurs (lien, import) ne renvoie jamais une fonction d'Object.
export const LECONS_BY_ID: Record<string, Lecon> = Object.assign(Object.create(null), Object.fromEntries(LECONS.map((l) => [l.id, l])))

export function getLecon(id: string): Lecon | undefined {
  return LECONS_BY_ID[id]
}

/** Les leçons d'un niveau, dans l'ordre de lecture. */
export const leconsDuNiveau = (niveau: Niveau): Lecon[] => LECONS.filter((l) => l.niveau === niveau)
