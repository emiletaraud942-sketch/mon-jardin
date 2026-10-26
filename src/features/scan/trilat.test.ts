import { describe, expect, it } from 'vitest'
import { circleIntersections, intersectionPrecisionM, nearestPoint, parseMeters, pointOnCircle, precisionText } from './trilat'

describe('distance saisie', () => {
  it.each([
    ['3,5', 3.5],
    ['3.5', 3.5],
    [' 12 m ', 12],
    ['0,8 m', 0.8],
    ['7', 7],
  ])('lit %s', (t, n) => expect(parseMeters(t)).toBe(n))
  it.each(['', 'abc', '0', '-2', '3,5,1', '500', '3 4'])('refuse « %s »', (t) => expect(parseMeters(t)).toBeUndefined())
})

describe('cercles', () => {
  it('aimante un toucher sur le cercle', () => {
    const p = pointOnCircle({ x: 0, y: 0 }, 5, { x: 10, y: 0 })
    expect(p.x).toBeCloseTo(5)
    expect(p.y).toBeCloseTo(0)
  })
  it('ne plante pas si le toucher est au centre', () => {
    const p = pointOnCircle({ x: 1, y: 1 }, 2, { x: 1, y: 1 })
    expect(Math.hypot(p.x - 1, p.y - 1)).toBeCloseTo(2)
  })
  it('trouve 2 intersections', () => {
    const pts = circleIntersections({ x: 0, y: 0 }, 5, { x: 6, y: 0 }, 5)
    expect(pts).toHaveLength(2)
    for (const p of pts) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(5)
      expect(Math.hypot(p.x - 6, p.y)).toBeCloseTo(5)
    }
  })
  it('trouve 1 point quand les cercles se touchent', () => {
    expect(circleIntersections({ x: 0, y: 0 }, 3, { x: 7, y: 0 }, 4)).toHaveLength(1)
  })
  it('trouve 0 point si trop loin, ou si l’un est dans l’autre', () => {
    expect(circleIntersections({ x: 0, y: 0 }, 1, { x: 10, y: 0 }, 1)).toHaveLength(0)
    expect(circleIntersections({ x: 0, y: 0 }, 10, { x: 1, y: 0 }, 2)).toHaveLength(0)
    expect(circleIntersections({ x: 0, y: 0 }, 2, { x: 0, y: 0 }, 2)).toHaveLength(0)
  })
  it('choisit le point le plus proche', () => {
    expect(nearestPoint([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 8, y: 1 })).toEqual({ x: 10, y: 0 })
    expect(nearestPoint([], { x: 0, y: 0 })).toBeUndefined()
  })
})

describe('précision', () => {
  it('est meilleure quand les cercles se croisent à angle droit', () => {
    const p = { x: 0, y: 3 }
    const droit = intersectionPrecisionM({ x: 0, y: 0 }, { x: 3, y: 3 }, p)
    const biais = intersectionPrecisionM({ x: 0, y: 0 }, { x: 0.3, y: 6 }, p)
    expect(droit).toBeLessThan(biais)
  })
  it('s’écrit à la française', () => {
    expect(precisionText(0.52)).toBe('environ 0,5 m')
    expect(precisionText(0.05)).toBe('environ 0,3 m')
  })
})
