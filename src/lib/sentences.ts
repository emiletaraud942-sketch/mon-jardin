// Règle de longueur des phrases (point 30 du plan : public novice et retraité), partagée par les tests.
export const MAX_WORDS = 20

/** Phrases d'un texte (coupe sur . ! ? suivis d'une espace ; « … » et les points de liste ne coupent pas). */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«“"'])/)
    .map((x) => x.trim())
    .filter(Boolean)
}
export const wordCount = (sentence: string) => sentence.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
