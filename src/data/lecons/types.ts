/**
 * Parcours « Apprendre à jardiner » : leçons courtes (3 à 5 minutes), statiques, hors ligne.
 * Contenu à relire par un jardinier ou un formateur avant diffusion large (voir docs/RELECTURE-LECONS.md).
 * Règles : phrases de 20 mots au plus, aucun produit chimique, aucune dose chiffrée, aucune règle légale précise,
 * formules prudentes (« souvent », « en général »), mois valables pour le nord et le centre de la France.
 */

/** Les quatre étapes du parcours, dans l'ordre. */
export type Niveau = 'comprendre' | 'preparer' | 'cultiver' | 'vivant'

/** Une question de quiz : une seule bonne réponse, une explication encourageante. */
export interface QuizQuestion {
  question: string
  /** 2 à 4 réponses possibles. */
  choix: string[]
  /** Index de la bonne réponse dans `choix`. */
  bonne: number
  /** Une phrase de 20 mots au plus, sans jamais dire « faux ». */
  explication: string
}

/** Un bouton qui mène à une fonction de l'appli. */
export interface Essayer {
  /** id EXACT d'une fonction de `src/lib/features.ts`. */
  fonction: string
  /** Texte du bouton, par exemple « Faire le test du sol ». */
  libelle: string
}

export interface Lecon {
  /** Identifiant en kebab-case, unique. */
  id: string
  niveau: Niveau
  /** Ordre de lecture global, de 1 à N sans trou. */
  ordre: number
  titre: string
  /** Durée de lecture, de 3 à 5 minutes. */
  minutes: number
  /** Une phrase de 20 mots au plus : ce que l'on saura à la fin. */
  objectif: string
  /** 4 à 7 phrases de 20 mots au plus : un point, une idée. */
  points: string[]
  /** Un geste à faire dans l'appli (facultatif). */
  essayer?: Essayer
  /** Exactement 3 questions. */
  quiz: QuizQuestion[]
  /** ids d'autres leçons à lire ensuite (facultatif). */
  plusLoin?: string[]
  /** Mois (1 à 12) où la leçon sert le plus, si elle est saisonnière (nord et centre de la France). */
  mois?: number[]
  /** ids EXACTS de `src/data/species` cités dans la leçon (jamais un id inventé). */
  planteIds?: string[]
  /** Rappel de prudence (facultatif). */
  attention?: string
  /** Origine du contenu, courte, sans lien ni citation précise. */
  source: string
}

/** Un niveau, avec son libellé et sa phrase de présentation. */
export interface NiveauInfo {
  id: Niveau
  libelle: string
  resume: string
}
