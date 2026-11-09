import { describe, expect, it } from 'vitest'
import { SOIL_QUESTIONS, soilFromAnswers, visibleQuestions, type SoilAnswers } from './soilTest'
import type { SoilTexture } from '../types'

const VALID: SoilTexture[] = ['argileux', 'limoneux', 'sableux', 'calcaire', 'humifere']
const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

describe('test du boudin', () => {
  it('pas de boule : sableux', () => {
    expect(soilFromAnswers({ ball: 'non' })?.sol).toBe('sableux')
  })
  it('boule mais pas de boudin : limoneux', () => {
    expect(soilFromAnswers({ ball: 'oui', sausage: 'non' })?.sol).toBe('limoneux')
  })
  it('boudin qui casse en anneau : limoneux', () => {
    expect(soilFromAnswers({ ball: 'oui', sausage: 'oui', ring: 'non' })?.sol).toBe('limoneux')
  })
  it('boudin qui se plie en anneau : argileux', () => {
    expect(soilFromAnswers({ ball: 'oui', sausage: 'oui', ring: 'oui' })?.sol).toBe('argileux')
  })
  it('réponses incomplètes : pas de résultat', () => {
    expect(soilFromAnswers({})).toBeUndefined()
    expect(soilFromAnswers({ ball: 'oui' })).toBeUndefined()
    expect(soilFromAnswers({ ball: 'oui', sausage: 'oui' })).toBeUndefined()
  })
  it('une réponse tardive est ignorée quand le test s’est arrêté plus tôt', () => {
    expect(soilFromAnswers({ ball: 'non', sausage: 'oui', ring: 'oui' })?.sol).toBe('sableux')
  })
  it('chaque issue est une valeur existante de Garden.sol, avec une phrase de 20 mots au plus', () => {
    const issues: SoilAnswers[] = [{ ball: 'non' }, { ball: 'oui', sausage: 'non' }, { ball: 'oui', sausage: 'oui', ring: 'non' }, { ball: 'oui', sausage: 'oui', ring: 'oui' }]
    for (const a of issues) {
      const r = soilFromAnswers(a)!
      expect(VALID).toContain(r.sol)
      expect(words(r.phrase)).toBeLessThanOrEqual(20)
    }
  })
  it('les questions apparaissent une à une', () => {
    expect(visibleQuestions({}).map((q) => q.key)).toEqual(['ball'])
    expect(visibleQuestions({ ball: 'oui' }).map((q) => q.key)).toEqual(['ball', 'sausage'])
    expect(visibleQuestions({ ball: 'oui', sausage: 'oui' }).map((q) => q.key)).toEqual(['ball', 'sausage', 'ring'])
    expect(visibleQuestions({ ball: 'non' }).map((q) => q.key)).toEqual(['ball'])
    expect(SOIL_QUESTIONS).toHaveLength(3)
  })
})
