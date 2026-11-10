/**
 * Plan léger du parcours « Apprendre à jardiner » : identifiant, rang et titre de chaque leçon, rien d'autre.
 * Il vit dans le chunk d'entrée (accueil, suivi) ; les leçons complètes (`src/data/lecons`) sont chargées à la demande
 * avec l'écran. Un test (`progress.test.ts`) vérifie que ce plan suit exactement les leçons.
 */
export interface LeconOutline {
  id: string
  /** Rang de lecture, de 1 à N. */
  ordre: number
  titre: string
}

export const LECON_OUTLINE: readonly LeconOutline[] = [
  { id: 'observer-jardin', ordre: 1, titre: 'Observer son jardin et le soleil' },
  { id: 'connaitre-sol', ordre: 2, titre: 'Connaître son sol' },
  { id: 'climat-gelees', ordre: 3, titre: 'Le climat et les gelées de chez soi' },
  { id: 'organiser-jardin', ordre: 4, titre: 'Organiser son jardin' },
  { id: 'nourrir-sol', ordre: 5, titre: 'Nourrir le sol' },
  { id: 'eau-jardin', ordre: 6, titre: 'L’eau au jardin' },
  { id: 'semer-planter', ordre: 7, titre: 'Semer et planter' },
  { id: 'entretenir', ordre: 8, titre: 'Entretenir sans produit' },
  { id: 'rotation-associations', ordre: 9, titre: 'Rotation et associations' },
  { id: 'tailler-debuter', ordre: 10, titre: 'Tailler pour débuter' },
  { id: 'biodiversite', ordre: 11, titre: 'Accueillir la vie au jardin' },
  { id: 'sante-jardin', ordre: 12, titre: 'La santé du jardin' },
  { id: 'permaculture-six-idees', ordre: 13, titre: 'La permaculture en six idées simples' },
  { id: 'jardin-saisons', ordre: 14, titre: 'Le jardin au fil des saisons' },
]
