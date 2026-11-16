import { describe, expect, it } from 'vitest'
import { inMetropole, inseeFromParcelRef, isMetropoleInsee, METROPOLE_INSEE, ROUEN_INSEE } from './territoire'

describe('territoire', () => {
  it('la Métropole compte 71 communes, dont Rouen', () => {
    expect(METROPOLE_INSEE.size).toBe(71)
    expect(isMetropoleInsee(ROUEN_INSEE)).toBe(true)
    expect(isMetropoleInsee('76217')).toBe(false) // Dieppe
    expect(isMetropoleInsee('75056')).toBe(false)
    expect(isMetropoleInsee(undefined)).toBe(false)
  })
  it('lit la commune dans l’identifiant de parcelle', () => {
    expect(inseeFromParcelRef('76540000AB0123')).toBe('76540')
    expect(inseeFromParcelRef('76540000a0001')).toBe('76540')
    expect(inseeFromParcelRef('x')).toBeUndefined()
    expect(inseeFromParcelRef('')).toBeUndefined()
    expect(inseeFromParcelRef(undefined)).toBeUndefined()
  })
  it('dit oui, non, ou « on ne sait pas »', () => {
    expect(inMetropole({ parcelRefs: ['76540000AB0123'] })).toBe(true)
    expect(inMetropole({ parcelRefs: ['69123000AB0123'] })).toBe(false)
    expect(inMetropole({ parcelRefs: ['x'] })).toBeUndefined()
    expect(inMetropole({})).toBeUndefined()
    expect(inMetropole(undefined)).toBeUndefined()
  })
})
