// Deux espèces exotiques envahissantes que la Métropole Rouen Normandie signale comme très communes en Normandie
// (« Guide : gestion à la parcelle favorable à la biodiversité », zoom sur deux espèces invasives, relevé le 16 nov. 2026).
// Elles ne sont pas au catalogue : l'alerte se montre quand on cherche ou saisit un de leurs noms.
import { normalizeSearch } from './search'

export interface Invasive {
  id: string
  titre: string
  noms: string[]
  texte: string
}

export const INVASIVES: Invasive[] = [
  {
    id: 'buddleia',
    titre: 'Buddleia (arbre aux papillons)',
    noms: ['buddleia', 'buddleja', 'arbre aux papillons', 'arbre a papillons'],
    texte: 'Il se ressème partout et prend la place des plantes locales. Ne le plantez pas : arrachez les jeunes pieds et taillez les anciens au ras du sol.',
  },
  {
    id: 'renouee',
    titre: 'Renouée du Japon',
    noms: ['renouee du japon', 'renouee', 'fallopia', 'reynoutria'],
    texte: 'Un petit bout de tige ou de racine suffit pour repartir : elle forme des fourrés très difficiles à enlever. Ne la plantez pas. Ne mettez jamais ses déchets au compost.',
  },
]

/** L'alerte qui correspond à ce que la personne tape (un nom ou le début d'un nom), sinon `undefined`. */
export function invasiveWarning(query: string): Invasive | undefined {
  const q = normalizeSearch(query).trim()
  if (q.length < 5) return undefined
  return INVASIVES.find((i) => i.noms.some((n) => n === q || (q.length >= 6 && n.startsWith(q)) || q.startsWith(n)))
}
