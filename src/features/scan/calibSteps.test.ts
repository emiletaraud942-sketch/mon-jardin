import { describe, expect, it } from 'vitest'
import { calibReducer, initialCalib, MAX_LANDMARKS, stepTitle, type CalibAction, type CalibState } from './calibSteps'

const run = (actions: CalibAction[], s: CalibState = initialCalib()) => actions.reduce(calibReducer, s)
const repere = (x: number): CalibAction[] => [
  { type: 'mesure', measured: { x, y: 0 }, accuracyM: 4 },
  { type: 'toucher', truth: { x: x + 1, y: 1 } },
  { type: 'valider-repere' },
]

describe('enchaînement du recalage', () => {
  it('commence par l’introduction puis le GPS', () => {
    expect(initialCalib().phase).toBe('intro')
    expect(run([{ type: 'commencer' }]).phase).toBe('gps')
  })
  it('ignore une action hors de son étape', () => {
    expect(run([{ type: 'mesure', measured: { x: 0, y: 0 }, accuracyM: 3 }]).phase).toBe('intro')
    expect(run([{ type: 'commencer' }, { type: 'valider-repere' }]).phase).toBe('gps')
  })
  it('exige le point sur la carte avant de valider un repère', () => {
    const s = run([{ type: 'commencer' }, { type: 'mesure', measured: { x: 0, y: 0 }, accuracyM: 3 }, { type: 'valider-repere' }])
    expect(s.phase).toBe('carte')
    expect(s.landmarks).toHaveLength(0)
  })
  it('repart au GPS après le 1er repère, propose la suite après le 2e', () => {
    let s = run([{ type: 'commencer' }, ...repere(0)])
    expect(s.phase).toBe('gps')
    expect(stepTitle(s)).toBe('Repère 2 : mesurer ma position')
    s = run(repere(10), s)
    expect(s.phase).toBe('suite')
    expect(s.landmarks).toHaveLength(2)
  })
  it('passe seul au bilan au 3e repère, jamais au-delà', () => {
    let s = run([{ type: 'commencer' }, ...repere(0), ...repere(10), { type: 'autre-repere' }, ...repere(20)])
    expect(s.phase).toBe('bilan')
    expect(s.landmarks).toHaveLength(MAX_LANDMARKS)
    s = calibReducer(s, { type: 'autre-repere' })
    expect(s.phase).toBe('bilan')
  })
  it('calcule dès 2 repères', () => {
    const s = run([{ type: 'commencer' }, ...repere(0), ...repere(10), { type: 'bilan' }])
    expect(s.phase).toBe('bilan')
  })
  it('refaire la mesure efface la mesure en cours', () => {
    const s = run([{ type: 'commencer' }, { type: 'mesure', measured: { x: 1, y: 1 }, accuracyM: 3 }, { type: 'toucher', truth: { x: 2, y: 2 } }, { type: 'refaire-mesure' }])
    expect(s).toMatchObject({ phase: 'gps', pending: undefined, truth: undefined })
  })
  it('retire le dernier repère', () => {
    const s = run([{ type: 'commencer' }, ...repere(0), ...repere(10), { type: 'annuler-dernier' }])
    expect(s.landmarks).toHaveLength(1)
    expect(s.phase).toBe('gps')
  })
  it('recommencer vide les repères', () => {
    expect(run([{ type: 'commencer' }, ...repere(0), { type: 'recommencer' }]).landmarks).toHaveLength(0)
  })
})
