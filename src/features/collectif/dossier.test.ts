import { describe, expect, it } from 'vitest'
import type { Plant } from '../../types'
import { MAX_LABELED, planGeometry, plantRows } from './dossier'

const sq = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]
const plant = (id: string, x: number, y: number): Plant => ({ id, gardenId: 'g', speciesId: 'pommier', position: { x, y }, plantedAt: '2026-03-01', status: 'en-place', photos: [] })

describe('plan du dossier', () => {
  it('dessine le nord en haut : y local devient -y', () => {
    const g = planGeometry({ parcel: sq(0, 0, 10) }, [{ position: { x: 2, y: 8 } }])
    expect(g.parcel).toContain('M0 0')
    expect(g.parcel).toContain('L0 -10')
    expect(g.plants[0]).toEqual({ n: 1, cx: 2, cy: -8 })
  })
  it('cadre la zone avec une marge, et garde un plan même sans rien', () => {
    const g = planGeometry({ parcel: sq(0, 0, 10) }, [])
    expect(g.width).toBe(16)
    expect(g.height).toBe(16)
    const vide = planGeometry({}, [])
    expect(vide.width).toBe(26)
    expect(vide.parcel).toBeUndefined()
  })
  it('choisit une barre d’échelle ronde, environ un cinquième de la largeur', () => {
    expect(planGeometry({ parcel: sq(0, 0, 100) }, []).scale.meters).toBe(20)
    expect(planGeometry({ parcel: sq(0, 0, 10) }, []).scale.meters).toBe(2)
  })
  it('ignore les bâtiments lointains', () => {
    const g = planGeometry({ parcel: sq(0, 0, 10), buildings: [{ id: 'a', ring: sq(2, 2, 4), heightM: 5 }, { id: 'b', ring: sq(500, 500, 4), heightM: 5 }] }, [])
    expect(g.buildings).toHaveLength(1)
  })
  it('inclut les parcelles individuelles, retournées pour le dessin', () => {
    const g = planGeometry({ plots: [{ id: 'p', n: 3, x: 1, y: 1, w: 2, h: 4, holder: 'Marie' }] }, [])
    expect(g.plots[0]).toMatchObject({ n: 3, x: 1, y: -5, w: 2, h: 4, holder: 'Marie' })
  })
  it('ne numérote que les 99 premières plantes sur le plan', () => {
    const ps = Array.from({ length: 150 }, (_, i) => ({ position: { x: i, y: 0 } }))
    expect(planGeometry({}, ps).plants).toHaveLength(MAX_LABELED)
  })
})

describe('tableau des plantes', () => {
  it('numérote dans le même ordre que le plan et trouve la parcelle', () => {
    const plots = [{ id: 'p1', n: 7, x: 0, y: 0, w: 2, h: 2, holder: 'Marie' }]
    const { rows, ordered } = plantRows([plant('b', 1, 1), plant('a', 9, 9)], () => 'Pommier', plots)
    expect(ordered.map((p) => p.id)).toEqual(['a', 'b'])
    expect(rows[1]).toMatchObject({ n: 2, plot: 7, holder: 'Marie' })
    expect(rows[0].plot).toBeUndefined()
  })
})
