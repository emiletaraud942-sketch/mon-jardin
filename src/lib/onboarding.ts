// Parcours d'accueil en 5 étapes. Module pur (aucun accès au navigateur) : l'état est un champ de GuideState (localStorage),
// jamais de IndexedDB. Rien n'est bloquant : chaque étape se fait ou se passe.

export type OnboardingStepId = 'adresse' | 'terrain' | 'plantes' | 'entretien' | 'voisins'
export const ONBOARDING_STEPS: OnboardingStepId[] = ['adresse', 'terrain', 'plantes', 'entretien', 'voisins']

export const STEP_TITLE: Record<OnboardingStepId, string> = {
  adresse: 'Mon adresse',
  terrain: 'Mon terrain',
  plantes: 'Mes plantes',
  entretien: 'Mon entretien',
  voisins: 'Mes voisins',
}
/** Phrase courte de la carte de route. */
export const STEP_HINT: Record<OnboardingStepId, string> = {
  adresse: 'Trouvez votre jardin sur la carte.',
  terrain: 'Photo, limites et maisons voisines.',
  plantes: 'Ajoutez-en une ou scannez le jardin.',
  entretien: 'Recevoir les rappels utiles',
  voisins: 'Facultatif : dons et conseils',
}

export interface OnboardingState {
  /** Les écrans de bienvenue ont été vus (ou le jardin d'exemple choisi). */
  welcomed: boolean
  done: OnboardingStepId[]
  skipped: OnboardingStepId[]
  /** « Passer et découvrir l'appli » : la carte de route est masquée. */
  hidden: boolean
  /** Utilisateur qui avait déjà un jardin et des plantes : jamais d'accueil forcé. */
  legacy?: boolean
}

export const EMPTY_ONBOARDING: OnboardingState = { welcomed: false, done: [], skipped: [], hidden: false }

/** Étapes proposées : « Mes voisins » disparaît si l'entraide n'est pas activée. */
export const activeSteps = (neighbors: boolean): OnboardingStepId[] => ONBOARDING_STEPS.filter((s) => s !== 'voisins' || neighbors)

export type StepStatus = 'done' | 'skipped' | 'todo'
export function stepStatus(s: OnboardingState, id: OnboardingStepId): StepStatus {
  if (s.done.includes(id)) return 'done'
  if (s.skipped.includes(id)) return 'skipped'
  return 'todo'
}

/** Première étape ni faite ni passée. */
export const currentStep = (s: OnboardingState, neighbors: boolean): OnboardingStepId | undefined => activeSteps(neighbors).find((id) => stepStatus(s, id) === 'todo')
export const isFinished = (s: OnboardingState, neighbors: boolean) => currentStep(s, neighbors) === undefined
/** Étapes faites ou passées. */
export const settledCount = (s: OnboardingState, neighbors: boolean) => activeSteps(neighbors).filter((id) => stepStatus(s, id) !== 'todo').length
export const percentDone = (s: OnboardingState, neighbors: boolean) => Math.round((settledCount(s, neighbors) / activeSteps(neighbors).length) * 100)
/** La carte « Votre jardin en N étapes » reste en haut de l'accueil tant que tout n'est pas fait ou passé, sauf si l'utilisateur l'a masquée. */
export const shouldShowRoute = (s: OnboardingState, neighbors: boolean) => !s.legacy && !s.hidden && !isFinished(s, neighbors)

const without = (list: OnboardingStepId[], id: OnboardingStepId) => list.filter((x) => x !== id)

/** Marque une étape comme faite ou passée (une étape ne peut pas être les deux). */
export function markStep(s: OnboardingState, id: OnboardingStepId, kind: 'done' | 'skipped'): OnboardingState {
  const done = kind === 'done' ? (s.done.includes(id) ? s.done : [...s.done, id]) : without(s.done, id)
  const skipped = kind === 'skipped' ? (s.skipped.includes(id) ? s.skipped : [...s.skipped, id]) : without(s.skipped, id)
  return { ...s, done, skipped }
}

/** Étape suivante dans l'ordre (que l'on soit passé par là ou non), ou `undefined` après la dernière. */
export function stepAfter(id: OnboardingStepId, neighbors: boolean): OnboardingStepId | undefined {
  const list = activeSteps(neighbors)
  return list[list.indexOf(id) + 1]
}
export function stepBefore(id: OnboardingStepId, neighbors: boolean): OnboardingStepId | undefined {
  const list = activeSteps(neighbors)
  const i = list.indexOf(id)
  return i > 0 ? list[i - 1] : undefined
}

export const markWelcomed = (s: OnboardingState): OnboardingState => ({ ...s, welcomed: true })
export const hideRoute = (s: OnboardingState): OnboardingState => ({ ...s, hidden: true })
/** « Revoir la visite » : tout repart de la première étape et la carte de route revient. */
export const restartTour = (_s: OnboardingState): OnboardingState => ({ welcomed: true, done: [], skipped: [], hidden: false, legacy: undefined })

export interface OnboardingContext {
  /** Au moins un jardin (le jardin d'exemple compte). */
  hasGarden: boolean
  /** Le jardin actif est le jardin d'exemple. */
  demo: boolean
  plantCount: number
}

/**
 * État de départ quand rien n'est enregistré.
 * - Jardin à soi avec des plantes : utilisateur existant, parcours marqué terminé et masqué (rien de forcé).
 * - Jardin à soi sans plante : adresse et terrain sont déjà faits, la suite reste proposée.
 * - Aucun jardin ou jardin d'exemple : nouvel utilisateur.
 */
export function deriveOnboarding(ctx: OnboardingContext): OnboardingState {
  if (!ctx.hasGarden || ctx.demo) return { ...EMPTY_ONBOARDING, welcomed: ctx.hasGarden }
  if (ctx.plantCount > 0) return { welcomed: true, done: [...ONBOARDING_STEPS], skipped: [], hidden: true, legacy: true }
  return { welcomed: true, done: ['adresse', 'terrain'], skipped: [], hidden: false }
}

/** Relit un état enregistré, en ignorant tout ce qui n'a pas la bonne forme. `undefined` si absent ou illisible. */
export function parseOnboarding(raw: unknown): OnboardingState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is OnboardingStepId => (ONBOARDING_STEPS as unknown[]).includes(x)) : [])
  const done = [...new Set(ids(r.done))]
  const skipped = [...new Set(ids(r.skipped))].filter((x) => !done.includes(x))
  return { welcomed: r.welcomed === true, done, skipped, hidden: r.hidden === true, legacy: r.legacy === true ? true : undefined }
}

/** Titre de la carte « Chez … » : « Chez Marie », mais « Mon jardin » reste « Mon jardin ». */
export function chezTitle(gardenName: string): string {
  const name = gardenName.trim()
  if (!name) return 'Chez vous'
  return /^(chez|mon|ma|mes|le|la|les)\b|^l[’']/i.test(name) ? name : `Chez ${name}`
}
