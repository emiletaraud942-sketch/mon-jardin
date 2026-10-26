import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../data/species'
import type { Plant } from '../types'
import { addMeasurement, compareSentence, differs, expectedVsAdjusted, needsRemeasure, parseMeasure, removeMeasurement } from './measure'

const plant = (over: Partial<Plant> = {}): Plant => ({ id: 'p', gardenId: 'g', speciesId: 'pommier', position: { x: 0, y: 0 }, plantedAt: '2022-03-01', status: 'en-place', photos: [], ...over })

describe('parseMeasure', () => {
  it('virgule et point français', () => {
    expect(parseMeasure('1,5', 60)).toBe(1.5)
    expect(parseMeasure(' 2.25 m ', 60)).toBe(2.25)
  })
  it('refuse vide, texte, négatif, zéro, trop grand', () => {
    for (const t of ['', 'abc', '-1', '0', '99', '1,2,3']) expect(parseMeasure(t, 60)).toBeUndefined()
  })
})

describe('mesures', () => {
  it('une mesure du même jour remplace la précédente, plus récente en tête', () => {
    let l = addMeasurement(undefined, { at: '2025-05-01', heightM: 1 })
    l = addMeasurement(l, { at: '2026-05-01', heightM: 2 })
    l = addMeasurement(l, { at: '2026-05-01', heightM: 2.2 })
    expect(l.map((m) => m.heightM)).toEqual([2.2, 1])
    expect(removeMeasurement(l, '2025-05-01')).toHaveLength(1)
  })
  it('phrase de comparaison', () => {
    expect(compareSentence('votre pommier', 2.1, 1.6)).toContain('devrait mesurer')
    expect(compareSentence('votre pommier', 2.1, 1.6)).toContain('vous avez mesuré')
  })
  it('écart de plus de 10 %', () => {
    expect(differs(2, 2.1)).toBe(false)
    expect(differs(2, 1.5)).toBe(true)
  })
  it('rappel annuel', () => {
    const now = new Date('2026-06-01')
    expect(needsRemeasure(plant({ measurements: [{ at: '2026-01-10', heightM: 2 }] }), now)).toBe(false)
    expect(needsRemeasure(plant({ measurements: [{ at: '2025-01-10', heightM: 2 }] }), now)).toBe(true)
    expect(needsRemeasure(plant(), now)).toBe(true)
    expect(needsRemeasure(plant({ plantedAt: '2026-03-01' }), now)).toBe(false)
  })
  it('prévue vs ajustée : une plante plus petite que prévu réduit la prévision', () => {
    const sp = SPECIES_BY_ID['pommier']
    if (!sp) return
    const now = new Date('2026-06-01')
    const base = expectedVsAdjusted(plant(), sp, now)
    const small = expectedVsAdjusted(plant({ measurements: [{ at: '2026-06-01', heightM: base.expected.heightM * 0.5 }] }), sp, now)
    expect(small.expected.heightM).toBeCloseTo(base.expected.heightM)
    expect(small.adjusted.heightM).toBeLessThan(base.expected.heightM)
  })
})
