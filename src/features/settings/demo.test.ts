import { describe, expect, it } from 'vitest'
import { DEMO_PLACE } from '../../data/demo'
import { DEMO_GARDEN_NAME, isDemoGarden } from './demo'

describe('jardin d’exemple', () => {
  it('reconnaît le jardin d’exemple à son adresse', () => {
    expect(isDemoGarden({ address: DEMO_PLACE.label })).toBe(true)
    expect(isDemoGarden({ address: '12 rue des Lilas, Nantes' })).toBe(false)
  })
  it('porte un nom qui dit que c’est un exemple', () => {
    expect(DEMO_GARDEN_NAME).toMatch(/^Exemple/)
  })
})
