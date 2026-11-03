import { describe, expect, it } from 'vitest'
import { climateOf } from './createGarden'

describe('climateOf', () => {
  it('garde zone (sans préfixe), minimale absolue et pluie', () => {
    expect(climateOf({ zone: 'Rusticité USDA 8a', minAbsC: -9.37, rainMmPerYear: 648 })).toEqual({ zone: '8a', minAbsC: -9.4, rainMmPerYear: 648 })
  })
})
