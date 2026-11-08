// Arbre du mode guidé « Que voulez-vous faire ? » : une question par écran, trois ou quatre réponses.
// Chaque réponse finale (une feuille) lance une fonction du registre (`features.ts`) : un test vérifie que l'identifiant existe.
// Module pur : les textes et les identifiants seulement.

export interface GuideLeaf {
  /** Texte du gros bouton. */
  mot: string
  /** Une phrase d'au plus 20 mots, sous le mot. */
  phrase: string
  /** Identifiant d'une fonction de `FEATURES`. */
  feature: string
}

export interface GuideBranch {
  id: string
  /** Texte du gros bouton de l'écran de départ. */
  mot: string
  /** La question de l'écran suivant. */
  question: string
  answers: GuideLeaf[]
}

export const GUIDE_TITLE = 'Que voulez-vous faire ?'

export const GUIDE_TREE: GuideBranch[] = [
  {
    id: 'voir',
    mot: 'Je veux voir mon jardin',
    question: 'Comment voulez-vous le voir ?',
    answers: [
      { mot: 'Le voir du ciel', phrase: 'La carte de votre terrain, avec vos plantes.', feature: 'carte' },
      { mot: 'Me promener dedans', phrase: 'En 3D, à hauteur d’yeux, avec le doigt.', feature: 'promenade' },
      { mot: 'Voir des photos', phrase: 'De vraies photos de votre jardin, prises en tournant.', feature: 'photos-jardin' },
    ],
  },
  {
    id: 'ajouter',
    mot: 'Je veux ajouter quelque chose',
    question: 'Que voulez-vous ajouter ?',
    answers: [
      { mot: 'Une plante', phrase: 'Choisissez-la, puis touchez la carte.', feature: 'ajouter-plante' },
      { mot: 'Une photo', phrase: 'Un souvenir de la pousse d’une plante.', feature: 'photo-plante' },
      { mot: 'Une mesure', phrase: 'Notez la hauteur et la largeur d’une plante.', feature: 'croissance' },
      { mot: 'Une plante, avec un mètre', phrase: 'Mesurez la distance à deux repères.', feature: 'par-mesures' },
    ],
  },
  {
    id: 'savoir',
    mot: 'Je veux savoir quoi faire',
    question: 'Que voulez-vous savoir ?',
    answers: [
      { mot: 'Ce qu’il y a à faire cette semaine', phrase: 'Tailler, arroser, récolter.', feature: 'a-faire' },
      { mot: 'Quoi planter, et où', phrase: 'Touchez un endroit : l’appli classe les plantes.', feature: 'ou-planter' },
      { mot: 'Quoi semer ce mois-ci', phrase: 'Les semis et plantations de la saison.', feature: 'semer-mois' },
      { mot: 'Un conseil sur une plante', phrase: 'Les fiches : soleil, eau, voisines, calendrier.', feature: 'catalogue' },
    ],
  },
  {
    id: 'regler',
    mot: 'Je veux sauvegarder ou changer un réglage',
    question: 'Quel réglage ?',
    answers: [
      { mot: 'Sauvegarder mes données', phrase: 'Un fichier à garder, au cas où.', feature: 'sauvegarde' },
      { mot: 'Texte plus grand', phrase: 'Normal, grand ou très grand.', feature: 'taille-texte' },
      { mot: 'Grandes touches', phrase: 'Des boutons plus hauts, plus faciles à toucher.', feature: 'grandes-touches' },
      { mot: 'Mon compte', phrase: 'Tous les réglages, au même endroit.', feature: 'compte' },
    ],
  },
]

/** Toutes les réponses finales, à plat (pour les tests). */
export const guideLeaves = (): GuideLeaf[] => GUIDE_TREE.flatMap((b) => b.answers)
