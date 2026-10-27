import { describe, expect, it } from 'vitest'
import { gpsCircleRadiusM, loupeCenter, loupeSource, rulerSummary } from './placeAids'

describe('rulerSummary', () => {
  it('liste limite, maison et plante voisine en français', () => {
    expect(rulerSummary([{ kind: 'limite', distM: 6 }, { kind: 'batiment', distM: 18 }, { kind: 'voisine', distM: 5.8 }])).toBe('Limite 6 m · Maison 18 m · Plante 5,8 m')
  })
  it('au plus 3 distances, rien si vide', () => {
    expect(rulerSummary([])).toBe('')
    expect(rulerSummary(Array.from({ length: 5 }, () => ({ kind: 'voisine' as const, distM: 1 }))).split(' · ')).toHaveLength(3)
  })
  it('ignore les valeurs non finies', () => {
    expect(rulerSummary([{ kind: 'limite', distM: NaN }])).toBe('')
  })
})

describe('loupeCenter', () => {
  const view = { w: 390, h: 700 }
  it('au-dessus du doigt', () => {
    const c = loupeCenter({ x: 200, y: 400 }, view, 132, 28)
    expect(c.x).toBe(200)
    expect(c.y).toBe(400 - 28 - 66)
  })
  it('reste dans la carte à gauche et à droite', () => {
    expect(loupeCenter({ x: 5, y: 400 }, view).x).toBe(66 + 4)
    expect(loupeCenter({ x: 389, y: 400 }, view).x).toBe(390 - 66 - 4)
  })
  it('trop près du haut : à côté du doigt, du côté le plus libre', () => {
    const left = loupeCenter({ x: 100, y: 60 }, view)
    expect(left.x).toBeGreaterThan(100)
    expect(left.y).toBeGreaterThanOrEqual(66 + 8)
    const right = loupeCenter({ x: 300, y: 60 }, view)
    expect(right.x).toBeLessThan(300)
  })
  it('la loupe ne recouvre jamais le doigt', () => {
    for (const f of [{ x: 20, y: 30 }, { x: 200, y: 120 }, { x: 370, y: 90 }, { x: 200, y: 600 }]) {
      const c = loupeCenter(f, view)
      const d = Math.max(Math.abs(c.x - f.x), Math.abs(c.y - f.y))
      expect(d).toBeGreaterThanOrEqual(66)
    }
  })
})

describe('loupeSource', () => {
  it('carré centré sur le point, en pixels réels', () => {
    const s = loupeSource({ x: 100, y: 200 }, 100, 2.5, 2)
    expect(s.sw).toBe(80)
    expect(s.sx).toBe(200 - 40)
    expect(s.sy).toBe(400 - 40)
  })
})

describe('gpsCircleRadiusM', () => {
  it('précision annoncée, au moins 0,5 m', () => {
    expect(gpsCircleRadiusM(4.2)).toBe(4.2)
    expect(gpsCircleRadiusM(0.1)).toBe(0.5)
    expect(gpsCircleRadiusM(NaN)).toBe(5)
  })
})
