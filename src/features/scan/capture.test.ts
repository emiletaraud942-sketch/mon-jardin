import { describe, expect, it } from 'vitest'
import type { Calibration } from '../../lib/calibration'
import { compassName, headingFromEvent, proposePosition } from './capture'

const sample = { x: 10, y: 5, spreadM: 1, accuracyM: 4 }

describe('position proposée', () => {
  it('garde la position mesurée sans recalage', () => {
    const p = proposePosition(sample, undefined)
    expect(p.position).toEqual({ x: 10, y: 5 })
    expect(p.accuracyM).toBe(4)
  })
  it('applique le recalage', () => {
    const c: Calibration = { a: 1, b: 0, tx: 2, ty: -1, rmsM: 0.5, n: 2 }
    expect(proposePosition(sample, c).position).toEqual({ x: 12, y: 4 })
  })
  it('ajoute le décalage devant moi (est = 90°)', () => {
    const p = proposePosition(sample, undefined, { headingDeg: 90, distanceM: 3 })
    expect(p.position.x).toBeCloseTo(13)
    expect(p.position.y).toBeCloseTo(5)
    expect(p.accuracyM).toBeGreaterThan(4)
  })
  it('vers le nord, le décalage monte', () => {
    expect(proposePosition(sample, undefined, { headingDeg: 0, distanceM: 2 }).position.y).toBeCloseTo(7)
  })
})

describe('boussole', () => {
  it('nomme les directions', () => {
    expect(compassName(0)).toBe('nord')
    expect(compassName(100)).toBe('est')
    expect(compassName(-90)).toBe('ouest')
    expect(compassName(359)).toBe('nord')
  })
  it('lit un cap iPhone ou absolu, ignore le relatif', () => {
    expect(headingFromEvent({ webkitCompassHeading: 123 })).toBe(123)
    expect(headingFromEvent({ alpha: 90, absolute: true })).toBe(270)
    expect(headingFromEvent({ alpha: 90, absolute: false })).toBeUndefined()
    expect(headingFromEvent({ alpha: null, absolute: true })).toBeUndefined()
  })
})
