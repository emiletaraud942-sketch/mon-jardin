/**
 * Guide « bestioles et maladies du jardin » : fiches statiques, hors ligne.
 * Contenu à relire par un jardinier ou un agronome avant diffusion large (voir docs/RELECTURE-ENNUIS.md).
 * Règles : phrases de 20 mots au plus, aucune dose chiffrée, aucun produit de synthèse, pollinisateurs protégés.
 */

/** Ce qui cause l'ennui : un insecte, un champignon (maladie), un mollusque (limace, escargot), un animal (oiseau, rongeur) ou autre chose. */
export type EnnuiType = 'insecte' | 'champignon' | 'mollusque' | 'animal' | 'autre'

export interface Ennui {
  /** Identifiant en kebab-case, unique. */
  id: string
  /** Nom affiché ; le nom latin, s'il y en a un, est entre parenthèses. */
  nom: string
  /** Noms usuels que l'on tape pour chercher : « puceron vert », « ver de la pomme »… */
  alias: string[]
  type: EnnuiType
  /** ids EXACTS de `src/data/species` concernés (jamais un id inventé). */
  planteIds: string[]
  /** Valeurs de `Species.famille` existantes, quand toute une famille est touchée (facultatif). */
  familles?: string[]
  /** « Ce que je vois » : phrases de 20 mots au plus. */
  signes: string[]
  /** Mots-clés de recherche par symptôme : « feuilles collantes », « taches brunes »… */
  signesMots: string[]
  /** Mois où l'on peut le voir (1 à 12). */
  mois: number[]
  /** Gestes pour éviter l'ennui. */
  prevenir: string[]
  /** Gestes pour agir, sans produit d'abord. */
  agir: string[]
  /** Quand demander conseil (jardinerie, voisin, conseiller). */
  inquietude: string
  /** Rappel de prudence quand un traitement existe (étiquette, floraison, pollinisateurs). */
  avertissement?: string
  /** Origine du contenu, courte, sans lien ni citation précise. */
  source: string
}
