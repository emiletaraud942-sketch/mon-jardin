// Visite des fonctions : 6 écrans, une phrase chacun. Montrée une fois, après l'accueil, puis rejouable depuis l'aide.
// Module pur pour les textes ; la mémoire « déjà vue » est dans la clé `pj.tourSeen` (voir l'inventaire des données).

export interface TourSlide {
  id: string
  title: string
  /** Une phrase (ou deux) de 20 mots au plus. */
  text: string
  /** Nom d'icône de `Icon`, et mot écrit à côté : une réplique du bouton dont on parle. */
  icon: string
  word: string
}

export const TOUR_SLIDES: TourSlide[] = [
  { id: 'accueil', title: 'L’accueil', text: 'Chaque gros bouton ouvre une partie de l’appli. Touchez-en un pour essayer.', icon: 'home', word: 'Accueil' },
  { id: 'tout', title: 'Tout ce que je peux faire', text: 'Cette page liste chaque fonction. Tapez un mot pour la trouver : photo, tailler.', icon: 'list', word: 'Tout' },
  { id: 'aide', title: 'L’aide', text: 'Aide explique l’écran où vous êtes. Elle peut aussi le lire à voix haute.', icon: 'help', word: 'Aide' },
  { id: 'perdu', title: 'Je suis perdu', text: 'Ce bouton vous ramène à l’accueil en un appui. Il propose aussi d’annuler.', icon: 'help', word: 'Je suis perdu' },
  { id: 'barre', title: 'La barre du bas', text: 'Elle change de partie : Accueil, Mon jardin, À faire, Planter. Accueil est toujours là.', icon: 'map', word: 'Mon jardin' },
  { id: 'annuler', title: 'Annuler', text: 'Un geste raté ? Touchez Annuler dans le message, ou dans Je suis perdu.', icon: 'undo', word: 'Annuler' },
]

const KEY = 'pj.tourSeen'

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true // mémoire indisponible : on ne remontre pas la visite à chaque ouverture
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* mémoire indisponible */
  }
}
