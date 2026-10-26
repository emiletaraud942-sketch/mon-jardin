import { describe, expect, it } from 'vitest'
import { TRIANGLE_CAP, autoTier, createFpsMeter, parseQualityPref, resolveTier } from './quality'

describe('qualité 3D', () => {
  it('réglage lu : valeur inconnue = Auto', () => {
    expect(parseQualityPref('simple')).toBe('simple')
    expect(parseQualityPref('detaille')).toBe('detaille')
    expect(parseQualityPref('auto')).toBe('auto')
    expect(parseQualityPref('???')).toBe('auto')
    expect(parseQualityPref(null)).toBe('auto')
  })
  it('Auto d’après le matériel', () => {
    expect(autoTier({ cores: 4, memoryGb: 2 })).toBe(0)
    expect(autoTier({ cores: 4 })).toBe(0)
    expect(autoTier({ cores: 6, memoryGb: 4 })).toBe(1)
    expect(autoTier({})).toBe(1)
    expect(autoTier({ cores: 8, memoryGb: 8 })).toBe(2)
    expect(autoTier({ cores: 12 })).toBe(2)
  })
  it('Auto abaisse le niveau si la fréquence d’images mesurée est faible, jamais ne le monte', () => {
    expect(autoTier({ cores: 8, memoryGb: 8 }, 25)).toBe(1)
    expect(autoTier({ cores: 8, memoryGb: 8 }, 15)).toBe(0)
    expect(autoTier({ cores: 6, memoryGb: 4 }, 25)).toBe(1)
    expect(autoTier({ cores: 4, memoryGb: 2 }, 60)).toBe(0)
    expect(autoTier({ cores: 8, memoryGb: 8 }, 60)).toBe(2)
  })
  it('Simple et Détaillé ignorent le matériel', () => {
    expect(resolveTier('simple', { cores: 16, memoryGb: 16 }, 60)).toBe(0)
    expect(resolveTier('detaille', { cores: 2, memoryGb: 1 }, 5)).toBe(2)
    expect(resolveTier('auto', { cores: 2 }, undefined)).toBe(0)
  })
  it('mesure de fréquence : médiane des images consécutives, écarts longs ignorés', () => {
    const m = createFpsMeter()
    for (let i = 0; i < 10; i++) m.push(16)
    expect(m.fps()).toBeUndefined() // échantillon trop petit
    for (let i = 0; i < 40; i++) m.push(50)
    m.push(2000) // rendu à la demande : pas une image lente
    expect(Math.round(m.fps()!)).toBe(20)
    m.reset()
    expect(m.fps()).toBeUndefined()
  })
  it('plafonds de triangles croissants, 150 k au plus', () => {
    expect(TRIANGLE_CAP[0]).toBeLessThan(TRIANGLE_CAP[1])
    expect(TRIANGLE_CAP[1]).toBeLessThan(TRIANGLE_CAP[2])
    expect(TRIANGLE_CAP[2]).toBeLessThanOrEqual(150000)
  })
})
