/**
 * Conseils « compost » et « économiser l'eau » : fiches statiques, hors ligne.
 * Contenu à relire par un jardinier avant diffusion large (voir docs/RELECTURE-CONSEILS.md).
 * Règles : phrases de 20 mots au plus, aucune dose chiffrée, aucun produit chimique, formules prudentes.
 */

/** Les deux guides. */
export type ConseilTheme = 'compost' | 'eau'

export interface Conseil {
  /** Identifiant en kebab-case, unique. */
  id: string
  theme: ConseilTheme
  titre: string
  /** Une phrase de 20 mots au plus. */
  resume: string
  /** Gestes dans l'ordre : une phrase de 20 mots au plus chacune. */
  etapes: string[]
  /** Petits plus (facultatif). */
  astuces?: string[]
  /** Rappel de prudence (facultatif). */
  attention?: string
  /** Mots que l'on tape pour chercher : « épluchures », « tonte », « paillage », « pluie »… */
  motsCles: string[]
  /** Mois (1 à 12) où le conseil sert le plus, si la fiche est saisonnière. */
  mois?: number[]
  /** ids EXACTS de `src/data/species` cités dans la fiche (facultatif ; jamais un id inventé). */
  planteIds?: string[]
  /** Origine du contenu, courte, sans lien ni citation précise. */
  source: string
}
