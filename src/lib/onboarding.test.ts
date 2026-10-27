import { describe, expect, it } from 'vitest'
import {
  EMPTY_ONBOARDING,
  activeSteps,
  chezTitle,
  currentStep,
  deriveOnboarding,
  hideRoute,
  isFinished,
  markStep,
  parseOnboarding,
  percentDone,
  restartTour,
  settledCount,
  shouldShowRoute,
  stepAfter,
  stepBefore,
  stepStatus,
} from './onboarding'

describe('étapes du parcours', () => {
  it('5 étapes dans l’ordre ; « Mes voisins » disparaît si l’entraide est désactivée', () => {
    expect(activeSteps(true)).toEqual(['adresse', 'terrain', 'plantes', 'entretien', 'voisins'])
    expect(activeSteps(false)).toEqual(['adresse', 'terrain', 'plantes', 'entretien'])
    expect(stepAfter('entretien', true)).toBe('voisins')
    expect(stepAfter('entretien', false)).toBeUndefined()
    expect(stepBefore('adresse', true)).toBeUndefined()
    expect(stepBefore('plantes', true)).toBe('terrain')
  })

  it('l’étape en cours est la première ni faite ni passée', () => {
    let s = EMPTY_ONBOARDING
    expect(currentStep(s, true)).toBe('adresse')
    s = markStep(s, 'adresse', 'done')
    s = markStep(s, 'terrain', 'skipped')
    expect(currentStep(s, true)).toBe('plantes')
    expect(stepStatus(s, 'terrain')).toBe('skipped')
    expect(settledCount(s, true)).toBe(2)
    expect(percentDone(s, true)).toBe(40)
  })

  it('passer une étape puis la faire (ou l’inverse) ne la compte qu’une fois', () => {
    let s = markStep(EMPTY_ONBOARDING, 'plantes', 'skipped')
    s = markStep(s, 'plantes', 'done')
    expect(s.skipped).toEqual([])
    expect(s.done).toEqual(['plantes'])
    s = markStep(s, 'plantes', 'done')
    expect(s.done).toEqual(['plantes'])
    s = markStep(s, 'plantes', 'skipped')
    expect(s.done).toEqual([])
  })

  it('reprise : l’avancement garde l’ordre, une étape passée reste rouvrable', () => {
    let s = markStep(EMPTY_ONBOARDING, 'adresse', 'done')
    s = markStep(s, 'terrain', 'skipped')
    expect(currentStep(s, true)).toBe('plantes')
    s = markStep(s, 'terrain', 'done') // reprise de l’étape passée
    expect(s.skipped).toEqual([])
    expect(currentStep(s, true)).toBe('plantes')
  })

  it('terminé quand tout est fait ou passé ; sans entraide, 4 étapes suffisent', () => {
    let s = EMPTY_ONBOARDING
    for (const id of ['adresse', 'terrain', 'plantes', 'entretien'] as const) s = markStep(s, id, id === 'plantes' ? 'skipped' : 'done')
    expect(isFinished(s, false)).toBe(true)
    expect(isFinished(s, true)).toBe(false)
    expect(shouldShowRoute(s, false)).toBe(false)
    expect(shouldShowRoute(s, true)).toBe(true)
    expect(percentDone(s, false)).toBe(100)
  })

  it('la carte de route reste tant que ce n’est pas fini, jusqu’à « Passer et découvrir »', () => {
    const s = markStep(EMPTY_ONBOARDING, 'adresse', 'done')
    expect(shouldShowRoute(s, true)).toBe(true)
    expect(shouldShowRoute(hideRoute(s), true)).toBe(false)
  })

  it('« Revoir la visite » repart de zéro et réaffiche la carte', () => {
    const s = restartTour(hideRoute(markStep({ ...EMPTY_ONBOARDING, legacy: true }, 'adresse', 'done')))
    expect(s).toEqual({ welcomed: true, done: [], skipped: [], hidden: false, legacy: undefined })
    expect(shouldShowRoute(s, true)).toBe(true)
  })
})

describe('utilisateurs existants et nouveaux', () => {
  it('aucun jardin : nouvel utilisateur, bienvenue à montrer', () => {
    expect(deriveOnboarding({ hasGarden: false, demo: false, plantCount: 0 })).toEqual(EMPTY_ONBOARDING)
  })
  it('jardin d’exemple : nouvel utilisateur, bienvenue déjà vue, aucune étape faite', () => {
    const s = deriveOnboarding({ hasGarden: true, demo: true, plantCount: 12 })
    expect(s).toMatchObject({ welcomed: true, done: [], hidden: false })
    expect(shouldShowRoute(s, true)).toBe(true)
  })
  it('jardin à soi avec des plantes : parcours terminé, rien de forcé', () => {
    const s = deriveOnboarding({ hasGarden: true, demo: false, plantCount: 3 })
    expect(s.legacy).toBe(true)
    expect(isFinished(s, true)).toBe(true)
    expect(shouldShowRoute(s, true)).toBe(false)
  })
  it('jardin à soi sans plante : adresse et terrain faits, la suite est proposée', () => {
    const s = deriveOnboarding({ hasGarden: true, demo: false, plantCount: 0 })
    expect(currentStep(s, true)).toBe('plantes')
    expect(s.legacy).toBeUndefined()
  })
})

describe('lecture de l’état enregistré', () => {
  it('ignore ce qui n’a pas la bonne forme', () => {
    expect(parseOnboarding(undefined)).toBeUndefined()
    expect(parseOnboarding('x')).toBeUndefined()
    expect(parseOnboarding({ welcomed: 1, done: ['adresse', 'nimporte', 3, 'adresse'], skipped: ['adresse', 'plantes'], hidden: 'oui' })).toEqual({
      welcomed: false,
      done: ['adresse'],
      skipped: ['plantes'],
      hidden: false,
      legacy: undefined,
    })
  })
})

describe('carte « Chez … »', () => {
  it('ajoute « Chez » seulement quand le nom s’y prête', () => {
    expect(chezTitle('Marie')).toBe('Chez Marie')
    expect(chezTitle('Chez Marie')).toBe('Chez Marie')
    expect(chezTitle('Mon jardin')).toBe('Mon jardin')
    expect(chezTitle('Mon jardin 2')).toBe('Mon jardin 2')
    expect(chezTitle('L’orée du bois')).toBe('L’orée du bois')
    expect(chezTitle('  ')).toBe('Chez vous')
  })
})
