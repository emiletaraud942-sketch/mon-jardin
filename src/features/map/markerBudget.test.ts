import { describe, expect, it } from 'vitest'
import { MARKER_BUDGET, sameIds, selectMarkerIds, type ScreenPoint } from './markerBudget'

const W = 390
const H = 600
const grid = (n: number, step = 10, x0 = 0, y0 = 0): ScreenPoint[] => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, x: x0 + (i % 40) * step, y: y0 + Math.floor(i / 40) * step }))

describe('plafond de marqueurs', () => {
  it('peu de plantes dans la vue : toutes rendues', () => {
    const r = selectMarkerIds({ points: grid(30), width: W, height: H })
    expect(r.ids.size).toBe(30)
    expect(r.overflow).toBe(0)
  })
  it('500 plantes dans la vue : au plus le plafond, les plus proches du centre', () => {
    const points = grid(500, 8, 5, 5)
    const r = selectMarkerIds({ points, width: W, height: H })
    expect(r.ids.size).toBe(MARKER_BUDGET)
    expect(r.inView).toBe(500)
    expect(r.overflow).toBe(500 - MARKER_BUDGET)
    const dist = (p: ScreenPoint) => Math.hypot(p.x - W / 2, p.y - H / 2)
    const worstKept = Math.max(...points.filter((p) => r.ids.has(p.id)).map(dist))
    const bestLeft = Math.min(...points.filter((p) => !r.ids.has(p.id)).map(dist))
    expect(worstKept).toBeLessThanOrEqual(bestLeft)
  })
  it('les plantes hors vue ne sont pas rendues, la marge les prépare', () => {
    const pts: ScreenPoint[] = [
      { id: 'dedans', x: 100, y: 100 },
      { id: 'marge', x: W + 30, y: 100 },
      { id: 'loin', x: W + 400, y: 100 },
      { id: 'loin2', x: -500, y: -500 },
    ]
    const r = selectMarkerIds({ points: pts, width: W, height: H })
    expect([...r.ids].sort()).toEqual(['dedans', 'marge'])
    expect(r.inView).toBe(2)
  })
  it('la plante choisie est rendue même hors vue, et compte dans le plafond', () => {
    const points = [...grid(400, 8, 5, 5), { id: 'choisie', x: 5000, y: 5000 }]
    const r = selectMarkerIds({ points, width: W, height: H, keep: ['choisie'] })
    expect(r.ids.has('choisie')).toBe(true)
    expect(r.ids.size).toBe(MARKER_BUDGET)
  })
  it('une plante gardée et dans la vue n’est pas comptée deux fois en trop-plein', () => {
    const points = grid(500, 8, 5, 5)
    const far = points.reduce((a, b) => (Math.hypot(a.x - W / 2, a.y - H / 2) > Math.hypot(b.x - W / 2, b.y - H / 2) ? a : b))
    const r = selectMarkerIds({ points, width: W, height: H, keep: [far.id] })
    expect(r.ids.has(far.id)).toBe(true)
    expect(r.ids.size).toBe(MARKER_BUDGET)
    expect(r.overflow).toBe(500 - MARKER_BUDGET)
  })
  it('un marqueur déjà rendu garde sa place face à un voisin presque aussi proche', () => {
    const pts: ScreenPoint[] = [
      { id: 'a', x: W / 2 + 100, y: H / 2 },
      { id: 'b', x: W / 2 + 95, y: H / 2 },
    ]
    expect([...selectMarkerIds({ points: pts, width: W, height: H, budget: 1 }).ids]).toEqual(['b'])
    expect([...selectMarkerIds({ points: pts, width: W, height: H, budget: 1, current: new Set(['a']) }).ids]).toEqual(['a'])
    // …mais pas face à un voisin nettement plus proche.
    const far: ScreenPoint[] = [
      { id: 'a', x: W / 2 + 200, y: H / 2 },
      { id: 'b', x: W / 2 + 20, y: H / 2 },
    ]
    expect([...selectMarkerIds({ points: far, width: W, height: H, budget: 1, current: new Set(['a']) }).ids]).toEqual(['b'])
  })
  it('résultat déterministe à distance égale', () => {
    const pts: ScreenPoint[] = [
      { id: 'z', x: W / 2 + 50, y: H / 2 },
      { id: 'a', x: W / 2 - 50, y: H / 2 },
    ]
    expect([...selectMarkerIds({ points: pts, width: W, height: H, budget: 1 }).ids]).toEqual(['a'])
  })
  it('carte pas encore mesurée : plafond appliqué quand même', () => {
    const r = selectMarkerIds({ points: grid(500), width: 0, height: 0 })
    expect(r.ids.size).toBe(MARKER_BUDGET)
  })
  it('aucune plante : rien', () => {
    const r = selectMarkerIds({ points: [], width: W, height: H })
    expect(r.ids.size).toBe(0)
    expect(r.overflow).toBe(0)
  })
  it('sameIds compare les ensembles', () => {
    expect(sameIds(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameIds(new Set(['a']), new Set(['a', 'b']))).toBe(false)
    expect(sameIds(new Set(['a', 'c']), new Set(['a', 'b']))).toBe(false)
  })
})
