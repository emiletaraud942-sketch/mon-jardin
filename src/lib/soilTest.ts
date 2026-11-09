import type { SoilTexture } from '../types'

// « Test du boudin » : trois questions, un seul résultat parmi les valeurs de `Garden.sol`.
// Module pur : on donne les réponses, on reçoit un sol et une phrase. Rien n'est écrit ici.

/** Une poignée de terre humide (pas détrempée) se rassemble-t-elle en boule ? */
export type SoilBall = 'non' | 'oui'
/** Peut-on la rouler en boudin, de la taille d'un crayon ? */
export type SoilSausage = 'non' | 'oui'
/** Le boudin se plie-t-il en anneau sans casser ? */
export type SoilRing = 'non' | 'oui'

export interface SoilAnswers {
  ball?: SoilBall
  sausage?: SoilSausage
  ring?: SoilRing
}

export interface SoilQuestion {
  key: keyof SoilAnswers
  question: string
  help: string
}

/** Les trois questions, dans l'ordre. La deuxième n'est posée que si la première est « oui », la troisième si la deuxième l'est. */
export const SOIL_QUESTIONS: SoilQuestion[] = [
  {
    key: 'ball',
    question: 'Prenez une poignée de terre humide. Se rassemble-t-elle en boule ?',
    help: 'Humidifiez-la si elle est sèche, sans la détremper. Serrez dans la main.',
  },
  {
    key: 'sausage',
    question: 'Pouvez-vous la rouler en boudin, fin comme un crayon ?',
    help: 'Roulez la boule entre vos paumes sur une table.',
  },
  {
    key: 'ring',
    question: 'Le boudin se plie-t-il en anneau sans casser ?',
    help: 'Courbez-le doucement autour de votre doigt.',
  },
]

export interface SoilResult {
  sol: SoilTexture
  /** Une phrase d'au plus 20 mots. */
  phrase: string
}

/** Le test ne distingue ni le calcaire ni l'humifère : on le dit à la personne. */
export const SOIL_TEST_LIMIT = 'Ce test ne reconnaît ni le sol calcaire ni le sol humifère : choisissez-les dans la liste.'

const RESULTS: Record<'sableux' | 'limoneux' | 'argileux', SoilResult> = {
  sableux: { sol: 'sableux', phrase: 'La terre ne se tient pas en boule : un sol léger, qui sèche vite.' },
  limoneux: { sol: 'limoneux', phrase: 'La boule se tient, le boudin casse : un sol équilibré, le plus facile à cultiver.' },
  argileux: { sol: 'argileux', phrase: 'Le boudin se plie en anneau : un sol lourd, qui colle aux bottes.' },
}

/** Les questions déjà posées : une réponse « non » arrête le test. */
export function visibleQuestions(a: SoilAnswers): SoilQuestion[] {
  const out: SoilQuestion[] = []
  for (const q of SOIL_QUESTIONS) {
    out.push(q)
    if (a[q.key] !== 'oui') break
  }
  return out
}

/** Le résultat, ou `undefined` tant qu'il manque une réponse utile. */
export function soilFromAnswers(a: SoilAnswers): SoilResult | undefined {
  if (a.ball === 'non') return RESULTS.sableux
  if (a.ball !== 'oui') return undefined
  if (a.sausage === 'non') return RESULTS.limoneux
  if (a.sausage !== 'oui') return undefined
  if (a.ring === 'non') return RESULTS.limoneux
  if (a.ring === 'oui') return RESULTS.argileux
  return undefined
}
