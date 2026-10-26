import type { XY } from '../../types'

// Enchaînement des étapes de « Recaler la carte sur ma position » (pur, testé).
// Intro → pour chaque repère : GPS, puis toucher la carte → bilan.

export const MIN_LANDMARKS = 2
export const MAX_LANDMARKS = 3

export interface Landmark {
  /** Position donnée par le GPS (repère local). */
  measured: XY
  /** Même point touché sur la carte. */
  truth: XY
  accuracyM: number
}

export type CalibPhase = 'intro' | 'gps' | 'carte' | 'suite' | 'bilan'

export interface CalibState {
  phase: CalibPhase
  landmarks: Landmark[]
  /** Mesure GPS du repère en cours, avant d'avoir touché la carte. */
  pending?: { measured: XY; accuracyM: number }
  /** Point touché sur la carte pour le repère en cours. */
  truth?: XY
}

export type CalibAction =
  | { type: 'commencer' }
  | { type: 'mesure'; measured: XY; accuracyM: number }
  | { type: 'toucher'; truth: XY }
  | { type: 'refaire-mesure' }
  | { type: 'valider-repere' }
  | { type: 'autre-repere' }
  | { type: 'bilan' }
  | { type: 'annuler-dernier' }
  | { type: 'recommencer' }

export const initialCalib = (): CalibState => ({ phase: 'intro', landmarks: [] })

export function calibReducer(s: CalibState, a: CalibAction): CalibState {
  switch (a.type) {
    case 'commencer':
      return s.phase === 'intro' ? { ...s, phase: 'gps' } : s
    case 'mesure':
      return s.phase === 'gps' ? { ...s, phase: 'carte', pending: { measured: a.measured, accuracyM: a.accuracyM }, truth: undefined } : s
    case 'toucher':
      return s.phase === 'carte' ? { ...s, truth: a.truth } : s
    case 'refaire-mesure':
      return s.phase === 'carte' ? { ...s, phase: 'gps', pending: undefined, truth: undefined } : s
    case 'valider-repere': {
      if (s.phase !== 'carte' || !s.pending || !s.truth) return s
      const landmarks = [...s.landmarks, { measured: s.pending.measured, truth: s.truth, accuracyM: s.pending.accuracyM }]
      const phase: CalibPhase = landmarks.length >= MAX_LANDMARKS ? 'bilan' : landmarks.length >= MIN_LANDMARKS ? 'suite' : 'gps'
      return { phase, landmarks, pending: undefined, truth: undefined }
    }
    case 'autre-repere':
      return s.phase === 'suite' && s.landmarks.length < MAX_LANDMARKS ? { ...s, phase: 'gps' } : s
    case 'bilan':
      return s.phase === 'suite' && s.landmarks.length >= MIN_LANDMARKS ? { ...s, phase: 'bilan' } : s
    case 'annuler-dernier': {
      if (s.landmarks.length === 0) return s
      const landmarks = s.landmarks.slice(0, -1)
      return { phase: landmarks.length >= MIN_LANDMARKS ? 'suite' : 'gps', landmarks }
    }
    case 'recommencer':
      return { phase: 'gps', landmarks: [] }
  }
}

/** Numéro (à partir de 1) du repère en cours. */
export const currentLandmark = (s: CalibState) => Math.min(MAX_LANDMARKS, s.landmarks.length + (s.phase === 'gps' || s.phase === 'carte' ? 1 : 0))

/** Titre de l'étape, en une phrase courte. */
export function stepTitle(s: CalibState): string {
  const n = currentLandmark(s)
  switch (s.phase) {
    case 'intro':
      return 'Recaler la carte sur ma position'
    case 'gps':
      return `Repère ${n} : mesurer ma position`
    case 'carte':
      return `Repère ${n} : le toucher sur la carte`
    case 'suite':
      return `${s.landmarks.length} repères notés`
    case 'bilan':
      return 'Résultat du recalage'
  }
}

/** Phrase d'aide de l'étape. */
export function stepHelp(s: CalibState): string {
  switch (s.phase) {
    case 'intro':
      return ''
    case 'gps':
      return s.landmarks.length === 0
        ? 'Placez-vous sur un repère visible sur la photo aérienne : coin de maison, portail ou angle de clôture.'
        : 'Allez à un autre repère, à plusieurs mètres du premier.'
    case 'carte':
      return s.truth ? 'Le point est posé. Touchez ailleurs pour le déplacer.' : 'Touchez sur la carte le même endroit, là où vous êtes.'
    case 'suite':
      return 'Deux repères suffisent. Un troisième rend le résultat plus sûr.'
    case 'bilan':
      return ''
  }
}
