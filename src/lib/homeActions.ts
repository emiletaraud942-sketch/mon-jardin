// Gros boutons de l'accueil : ordre FIXE, un verbe et une phrase d'une ligne. Chaque bouton lance une fonction du registre
// (`features.ts`, `featureId`) ou une page de l'aide (`special`). Module pur : textes et identifiants seulement.

export type HomeSpecial = 'tout' | 'guide' | 'perdu'

export interface HomeAction {
  id: string
  mot: string
  /** Une phrase d'au plus 20 mots, d'une ligne si possible. */
  phrase: string
  /** Nom d'icône de `Icon` (décorative : le mot est écrit). */
  icon: string
  featureId?: string
  special?: HomeSpecial
  /** Mis en avant (fond plein). */
  primary?: boolean
}

/** Les actions principales, dans l'ordre. « Voisins » ne s'affiche que si l'entraide est configurée (`visibleSi` du registre). */
export const HOME_ACTIONS: HomeAction[] = [
  { id: 'ajouter', mot: 'Ajouter une plante', phrase: 'Touchez la carte pour la poser.', icon: 'plus', featureId: 'ajouter-plante', primary: true },
  { id: 'carte', mot: 'Voir mon jardin', phrase: 'Votre terrain, vu du ciel.', icon: 'map', featureId: 'carte' },
  { id: 'promenade', mot: 'Me promener dans mon jardin en 3D', phrase: 'Marchez dedans, avec le doigt.', icon: 'cube', featureId: 'promenade' },
  { id: 'photos', mot: 'Photos du jardin', phrase: 'Votre jardin en vraies photos.', icon: 'camera', featureId: 'photos-jardin' },
  { id: 'scanner', mot: 'Scanner mon jardin', phrase: 'Placez vos plantes en marchant.', icon: 'scan', featureId: 'scanner' },
  { id: 'afaire', mot: 'Ce qu’il y a à faire', phrase: 'Tailler, arroser, récolter.', icon: 'check', featureId: 'a-faire' },
  { id: 'planter', mot: 'Où planter ?', phrase: 'Quelle plante va où, chez vous.', icon: 'leaf', featureId: 'ou-planter' },
  { id: 'voisins', mot: 'Voisins', phrase: 'Dons, échanges, rendez-vous.', icon: 'users', featureId: 'voisins' },
  { id: 'tout', mot: 'Tout ce que je peux faire', phrase: 'Chaque fonction, avec recherche.', icon: 'list', special: 'tout' },
  { id: 'aide', mot: 'Aide', phrase: 'Explique l’écran où vous êtes.', icon: 'help', featureId: 'aide-ecran' },
]

/** Boutons de pied : le mode guidé et la feuille « Je suis perdu » (la pastille flottante est cachée sur l'accueil). */
export const HOME_HELPERS: HomeAction[] = [
  { id: 'guide', mot: 'Je ne sais pas par où commencer', phrase: 'Quelques questions, une à la fois.', icon: 'help', special: 'guide' },
  { id: 'perdu', mot: 'Je suis perdu', phrase: 'Accueil, annuler, ou de l’aide.', icon: 'alert', special: 'perdu' },
]
