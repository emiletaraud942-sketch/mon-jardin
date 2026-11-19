// Étiquette tenue de côté ou à l'envers (pur, testé) : une photo de sachet prise « en paysage » donne un texte couché que
// Tesseract ne lit pas. On mesure ce qu'une lecture a de lisible ; si c'est peu, on retente à 90° et 270° et on garde la meilleure.

export interface ScoredWord {
  text: string
  /** Confiance de Tesseract pour ce mot, 0 à 100. */
  confidence: number
}

/** Lisibilité d'une lecture : somme des confiances des vrais mots (3 lettres ou plus, confiance 50 ou plus). */
export function readability(words: ScoredWord[]): number {
  let score = 0
  for (const w of words) {
    const letters = (w.text.match(/\p{L}/gu) ?? []).length
    if (letters >= 3 && w.confidence >= 50) score += w.confidence / 100
  }
  return score
}

/** En dessous, la lecture est suspecte : on essaie les autres sens. Un sachet lu normalement dépasse largement 15. */
export const ROTATION_TRIGGER = 12

export type Quarter = 0 | 90 | 180 | 270

/** Sens à garder, d'après la lisibilité de chaque sens essayé. On ne change de sens que si c'est nettement mieux (jamais sur un bruit). */
export function pickRotation(scores: Partial<Record<Quarter, number>>): Quarter {
  const base = scores[0] ?? 0
  let best: Quarter = 0
  let bestScore = base
  for (const q of [90, 270, 180] as const) {
    const s = scores[q]
    if (s !== undefined && s > bestScore) {
      best = q
      bestScore = s
    }
  }
  return best !== 0 && bestScore >= base * 1.6 + 4 ? best : 0
}
