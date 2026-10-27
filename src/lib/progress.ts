import type { Garden, Plant, Species } from '../types'

// Avancement de la modélisation du jardin. Module pur : rien n'est jamais bloqué, ce ne sont que des suggestions.

export type StepId = 'adresse' | 'donnees' | 'premier-arbre' | 'cinq-plantes' | 'sol'

/** Ce que fait le bouton d'une étape (l'interface décide de l'écran à ouvrir). */
export type StepActionKind = 'donnees' | 'placer' | 'sol'

export interface ProgressStep {
  id: StepId
  label: string
  done: boolean
  hint: string
  action?: { kind: StepActionKind; label: string }
}

export interface Progress {
  steps: ProgressStep[]
  /** 0 à 100. */
  percent: number
  /** Étapes faites et nombre total (« 3 étapes sur 5 »). */
  doneCount: number
  total: number
  /** Première étape à faire, s'il en reste. */
  next?: ProgressStep
  /** Plantes au statut « en place ». */
  placedCount: number
  /** L'utilisateur a déjà ouvert l'écran Entretien pour ce jardin. */
  openedEntretien: boolean
}

export interface ProgressOpts {
  speciesById: Record<string, Pick<Species, 'strate'> | undefined>
  openedEntretien?: boolean
}

/** « Premiers pas » : les 3 étapes qui demandent un geste de l'utilisateur (les deux autres se font toutes seules). */
export const FIRST_STEP_IDS: StepId[] = ['premier-arbre', 'cinq-plantes', 'sol']
export const firstSteps = (p: Progress): ProgressStep[] => FIRST_STEP_IDS.map((id) => p.steps.find((s) => s.id === id)!).filter(Boolean)

const TREE_STRATES = new Set(['canopee', 'arbre-bas', 'arbuste'])
export const PLANTS_GOAL = 5
/** Seuil de la proposition « passer à l'entretien ». */
export const READY_PERCENT = 70
export const READY_PLANTS = 3

export function computeProgress(garden: Garden, plants: Plant[], opts: ProgressOpts): Progress {
  const mine = plants.filter((p) => p.gardenId === garden.id)
  const placed = mine.filter((p) => p.status === 'en-place')
  const hasTree = placed.some((p) => TREE_STRATES.has(opts.speciesById[p.speciesId]?.strate ?? ''))
  const steps: ProgressStep[] = [
    { id: 'adresse', label: 'Adresse trouvée', done: true, hint: 'Votre jardin est repéré sur la carte.' },
    {
      id: 'donnees',
      label: 'Terrain et maisons voisines récupérés',
      done: !!garden.parcel?.length && garden.buildings !== undefined,
      hint: 'Ils cadrent la carte et servent à calculer l’ombre.',
      action: { kind: 'donnees', label: 'Réessayer' },
    },
    {
      id: 'premier-arbre',
      label: 'Premier arbre ou arbuste placé',
      done: hasTree,
      hint: 'Les grands arbres font de l’ombre : placez-les d’abord.',
      action: { kind: 'placer', label: 'Ajouter' },
    },
    {
      id: 'cinq-plantes',
      label: `${PLANTS_GOAL} plantes placées`,
      done: placed.length >= PLANTS_GOAL,
      hint: `${Math.min(placed.length, PLANTS_GOAL)} sur ${PLANTS_GOAL}. Touchez la carte là où se trouve chaque plante.`,
      action: { kind: 'placer', label: 'Ajouter' },
    },
    {
      id: 'sol',
      label: 'Nature du sol choisie',
      done: !!garden.sol,
      hint: 'Argileux, sableux… : nos conseils en tiennent compte.',
      action: { kind: 'sol', label: 'Choisir' },
    },
  ]
  const doneCount = steps.filter((s) => s.done).length
  return {
    steps,
    percent: Math.round((doneCount / steps.length) * 100),
    doneCount,
    total: steps.length,
    next: steps.find((s) => !s.done),
    placedCount: placed.length,
    openedEntretien: !!opts.openedEntretien,
  }
}

export type SuggestedMode = 'jardin' | 'entretenir' | 'planifier'

/**
 * Mode conseillé. « entretenir » dès que le jardin est assez modélisé (≥ 70 % et ≥ 3 plantes en place) ;
 * « planifier » seulement si l'utilisateur a déjà ouvert Entretien ; sinon « jardin ».
 */
export function suggestedMode(p: Progress): SuggestedMode {
  if (p.percent < READY_PERCENT || p.placedCount < READY_PLANTS) return 'jardin'
  return p.openedEntretien ? 'planifier' : 'entretenir'
}

// ---------- « Prochaine étape » (accueil) ----------

export type NextStepKind = 'creer' | 'placer' | 'sol' | 'donnees' | 'taches'

/** Une seule action à proposer : un titre court, une phrase, le libellé du bouton et ce qu'il fait (l'interface choisit l'écran). */
export interface NextStep {
  kind: NextStepKind
  title: string
  text: string
  action: string
}

export interface NextStepContext {
  /** Le jardin actif est le jardin d'exemple. */
  demo: boolean
  /** Tâches de la semaine pas encore faites. */
  openTasks: number
}

/**
 * La prochaine chose à faire, une seule, dans cet ordre : créer son vrai jardin (si c'est l'exemple), placer le premier arbre,
 * atteindre 5 plantes, choisir le sol, récupérer les données manquantes, puis les tâches de la semaine. `undefined` : rien à proposer.
 * Module pur : rien n'est jamais bloqué, ce n'est qu'une suggestion.
 */
export function nextStep(p: Progress, ctx: NextStepContext): NextStep | undefined {
  if (ctx.demo) return { kind: 'creer', title: 'Créez votre vrai jardin', text: 'Vous visitez un jardin d’exemple. Tapez votre adresse pour avoir le vôtre.', action: 'Commencer' }
  const open = (id: StepId) => p.steps.find((s) => s.id === id && !s.done)
  if (open('premier-arbre')) {
    return { kind: 'placer', title: 'Placez votre premier arbre', text: 'Les grands arbres font de l’ombre : placez-les d’abord.', action: 'Ajouter une plante' }
  }
  if (open('cinq-plantes')) {
    const left = Math.max(1, PLANTS_GOAL - p.placedCount)
    return { kind: 'placer', title: `Placez ${left} plante${left > 1 ? 's' : ''} de plus`, text: 'Touchez la carte là où se trouve chaque plante.', action: 'Ajouter une plante' }
  }
  if (open('sol')) return { kind: 'sol', title: 'Choisissez la nature du sol', text: 'Argileux, sableux… : nos conseils en tiennent compte.', action: 'Choisir' }
  if (open('donnees')) return { kind: 'donnees', title: 'Récupérez les infos du terrain', text: 'Le plan et les maisons voisines servent à calculer l’ombre.', action: 'Réessayer' }
  if (ctx.openTasks > 0) {
    return { kind: 'taches', title: ctx.openTasks === 1 ? '1 chose à faire cette semaine' : `${ctx.openTasks} choses à faire cette semaine`, text: 'Cochez-les au fur et à mesure.', action: 'Voir la liste' }
  }
  return undefined
}
