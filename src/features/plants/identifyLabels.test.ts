import { describe, expect, it } from 'vitest'
import { confidenceLabel, listLabel } from './identifyLabels'

describe('identifyLabels', () => {
  it('« Probable à 87 % »', () => {
    expect(confidenceLabel(0.874)).toBe('Probable à 87 %')
    expect(confidenceLabel(1.4)).toBe('Probable à 100 %')
    expect(confidenceLabel(-1)).toBe('Probable à 0 %')
  })
  it('dit si la plante est dans la liste', () => {
    expect(listLabel(false, false)).toBe('Pas dans notre liste')
    expect(listLabel(true, false)).toBe('Dans notre liste')
    expect(listLabel(true, true)).toBe('Plante proche dans notre liste')
  })
})
