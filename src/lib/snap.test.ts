import { describe, expect, it } from 'vitest'
import { detectRows, gridLines, measureRuler, metersPerPixel, snapPoint, thresholdMeters, uncertaintyRadiusM } from './snap'

const square = [
  { x: -10, y: -10 },
  { x: 10, y: -10 },
  { x: 10, y: 10 },
  { x: -10, y: 10 },
]

describe('seuil en mètres', () => {
  it('diminue quand on zoome', () => {
    expect(metersPerPixel(20, 45)).toBeLessThan(metersPerPixel(19, 45))
    expect(metersPerPixel(20, 45)).toBeCloseTo(0.0554, 2)
    expect(thresholdMeters(20, 20, 45)).toBeCloseTo(20 * metersPerPixel(20, 45), 6)
  })
})

describe('snapPoint', () => {
  it('sans repère à portée : point inchangé', () => {
    const r = snapPoint({ x: 0, y: 0 }, { parcel: square }, 0.5)
    expect(r.point).toEqual({ x: 0, y: 0 })
    expect(r.guides).toEqual([])
    expect(r.snappedTo).toBeUndefined()
  })
  it('s’accroche à la limite du terrain', () => {
    const r = snapPoint({ x: 9.7, y: 3 }, { parcel: square }, 0.5)
    expect(r.point.x).toBeCloseTo(10)
    expect(r.point.y).toBeCloseTo(3)
    expect(r.snappedTo).toBe('limite')
    expect(r.guides[0].kind).toBe('limite')
  })
  it('s’accroche à une façade', () => {
    const house = [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]]
    const r = snapPoint({ x: 2, y: 4.3 }, { buildings: house }, 0.5)
    expect(r.point).toEqual({ x: 2, y: 4 })
    expect(r.snappedTo).toBe('facade')
  })
  it('s’aligne sur x d’une autre plante', () => {
    const r = snapPoint({ x: 2.2, y: 5 }, { plants: [{ x: 2, y: 0 }] }, 0.5)
    expect(r.point).toEqual({ x: 2, y: 5 })
    expect(r.snappedTo).toBe('plante')
    expect(r.guides).toHaveLength(1)
  })
  it('s’aligne sur x et y de deux plantes (grille)', () => {
    const r = snapPoint({ x: 2.1, y: 3.1 }, { plants: [{ x: 2, y: 0 }, { x: 0, y: 3 }] }, 0.5)
    expect(r.point).toEqual({ x: 2, y: 3 })
    expect(r.guides).toHaveLength(2)
  })
  it('prolonge un espacement régulier', () => {
    const r = snapPoint({ x: 4.9, y: 0.05 }, { plants: [{ x: 0, y: 0 }, { x: 2.5, y: 0 }] }, 0.3)
    expect(r.point.x).toBeCloseTo(5)
    expect(r.point.y).toBeCloseTo(0)
    expect(['espacement', 'plante']).toContain(r.snappedTo)
  })
  it('s’accroche à un rang', () => {
    const r = snapPoint({ x: 7, y: 0.2 }, { rows: [{ a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }] }, 0.4)
    expect(r.point.y).toBeCloseTo(0)
    expect(r.point.x).toBeCloseTo(7)
    expect(r.snappedTo).toBe('rang')
  })
  it('choisit le repère le plus proche', () => {
    const r = snapPoint({ x: 9.9, y: 0 }, { parcel: square, plants: [{ x: 9.6, y: 8 }] }, 0.5)
    expect(r.snappedTo).toBe('limite')
  })
  it('seuil nul ou point invalide : rien', () => {
    expect(snapPoint({ x: 9.9, y: 0 }, { parcel: square }, 0).point).toEqual({ x: 9.9, y: 0 })
    expect(snapPoint({ x: NaN, y: 0 }, { parcel: square }, 1).guides).toEqual([])
  })
})

describe('detectRows', () => {
  it('trouve un rang de 3 plantes alignées', () => {
    const rows = detectRows([{ x: 0, y: 0 }, { x: 2, y: 0.02 }, { x: 4, y: 0 }, { x: 1, y: 5 }])
    expect(rows).toHaveLength(1)
  })
  it('deux plantes ne font pas un rang', () => {
    expect(detectRows([{ x: 0, y: 0 }, { x: 2, y: 0 }])).toEqual([])
  })
})

describe('measureRuler', () => {
  it('limite, deux voisines, bâtiment', () => {
    const r = measureRuler(
      { x: 8, y: 0 },
      {
        parcel: square,
        buildings: [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]],
        plants: [{ x: 6, y: 0 }, { x: 8, y: 3 }, { x: -5, y: -5 }],
        legalM: 2.5,
      },
    )
    expect(r.map((x) => x.kind)).toEqual(['limite', 'batiment', 'voisine', 'voisine'])
    expect(r[0].distM).toBeCloseTo(2)
    expect(r[0].tooClose).toBe(true)
    expect(r[1].distM).toBeCloseTo(4)
    expect(r[2].distM).toBeCloseTo(2)
    expect(r[3].distM).toBeCloseTo(3)
  })
  it('sans données : liste vide', () => {
    expect(measureRuler({ x: 0, y: 0 }, {})).toEqual([])
  })
})

describe('gridLines', () => {
  it('une ligne par mètre dans le cadre', () => {
    expect(gridLines({ x: 0.5, y: 0.5 }, { x: 3.5, y: 2.5 }, 1)).toHaveLength(3 + 2)
  })
  it('trop de lignes : rien', () => {
    expect(gridLines({ x: 0, y: 0 }, { x: 1000, y: 1000 }, 1)).toEqual([])
  })
})

describe('uncertaintyRadiusM', () => {
  it('3 m sans recalage, 1 à 2 m avec', () => {
    expect(uncertaintyRadiusM(undefined)).toBe(3)
    expect(uncertaintyRadiusM(0.3)).toBe(1)
    expect(uncertaintyRadiusM(1.4)).toBe(1.4)
    expect(uncertaintyRadiusM(5)).toBe(2)
  })
})
