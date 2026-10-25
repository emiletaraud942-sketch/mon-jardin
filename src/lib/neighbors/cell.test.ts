import { describe, expect, it } from 'vitest'
import { CELL_SLACK_KM, CELL_STEPS, cellBounds, cellDistanceKm, distanceLabel, isOnGrid, isValidCoord, roundCell } from './cell'

describe('roundCell : standard (0,02° x 0,03°, environ 2 km)', () => {
  it('arrondit sur la grille', () => {
    expect(roundCell(48.85661, 2.35222, 'standard')).toEqual({ lat: 48.86, lon: 2.34 })
    expect(roundCell(-33.8688, 151.2093, 'standard')).toEqual({ lat: -33.86, lon: 151.2 })
  })
  it('égalité exacte : arrondie vers le haut, comme le SQL (floor(x / pas + 0,5))', () => {
    expect(roundCell(47.23, 2.08, 'standard')).toEqual({ lat: 47.24, lon: 2.07 })
    expect(roundCell(-33.87, 151.21, 'standard')).toEqual({ lat: -33.86, lon: 151.2 })
  })
  it('ne produit pas de -0', () => {
    expect(Object.is(roundCell(-0.004, 0.004, 'standard').lat, 0)).toBe(true)
    expect(Object.is(roundCell(-0.004, -0.004, 'large').lon, 0)).toBe(true)
  })
  it('est idempotent', () => {
    for (const size of ['standard', 'large'] as const) {
      const c = roundCell(45.7578, 4.832, size)
      expect(roundCell(c.lat, c.lon, size)).toEqual(c)
    }
  })
  it('ne laisse sortir que des valeurs de la grille, jamais plus de 2 décimales', () => {
    for (let i = 0; i < 2000; i++) {
      const lat = -90 + (i * 0.0913) % 180
      const lon = -180 + (i * 0.1771) % 360
      for (const size of ['standard', 'large'] as const) {
        const c = roundCell(lat, lon, size)
        expect(isOnGrid(c, size)).toBe(true)
        expect(Math.abs(c.lat * 100 - Math.round(c.lat * 100))).toBeLessThan(1e-6)
        expect(Math.abs(c.lon * 100 - Math.round(c.lon * 100))).toBeLessThan(1e-6)
        expect(Math.abs(Math.round(c.lat * 100) % CELL_STEPS[size].lat)).toBe(0)
        expect(Math.abs(Math.round(c.lon * 100) % CELL_STEPS[size].lon)).toBe(0)
        expect(Math.abs(c.lat - lat)).toBeLessThanOrEqual(CELL_STEPS[size].lat / 200 + 1e-9)
        expect(Math.abs(c.lon - lon)).toBeLessThanOrEqual(CELL_STEPS[size].lon / 200 + 1e-9)
      }
    }
  })
})

describe('roundCell : large (0,05° x 0,07°, environ 5 km)', () => {
  it('arrondit sur la grille', () => {
    expect(roundCell(48.85661, 2.35222, 'large')).toEqual({ lat: 48.85, lon: 2.38 })
    expect(roundCell(47.2234, 2.0677, 'large')).toEqual({ lat: 47.2, lon: 2.1 })
  })
  it('bornes : le pôle et le méridien 180 restent valides', () => {
    expect(roundCell(89.99, 179.99, 'large')).toEqual({ lat: 90, lon: 179.97 })
    expect(roundCell(-89.99, -179.99, 'large')).toEqual({ lat: -90, lon: -179.97 })
  })
  it('la taille change la cellule', () => {
    expect(roundCell(48.8566, 2.3522, 'standard')).not.toEqual(roundCell(48.8566, 2.3522, 'large'))
  })
  it('une cellule fine (ancienne grille 0,01°) est ramenée sur la grille', () => {
    expect(isOnGrid({ lat: 48.87, lon: 2.35 }, 'standard')).toBe(false)
    expect(isOnGrid(roundCell(48.87, 2.35, 'standard'), 'standard')).toBe(true)
  })
})

describe('tailles réelles des cellules', () => {
  it('standard : environ 2 km, large : environ 5 km (à 47° N)', () => {
    const cos = Math.cos((47 * Math.PI) / 180)
    const km = (s: 'standard' | 'large') => ({ ns: (CELL_STEPS[s].lat / 100) * 111.32, ew: (CELL_STEPS[s].lon / 100) * 111.32 * cos })
    expect(km('standard').ns).toBeCloseTo(2.2, 1)
    expect(km('standard').ew).toBeCloseTo(2.28, 1)
    expect(km('large').ns).toBeCloseTo(5.57, 1)
    expect(km('large').ew).toBeCloseTo(5.31, 1)
  })
})

describe('isValidCoord', () => {
  it('refuse hors bornes et non finis', () => {
    expect(isValidCoord(91, 0)).toBe(false)
    expect(isValidCoord(0, 181)).toBe(false)
    expect(isValidCoord(NaN, 0)).toBe(false)
    expect(isValidCoord(48.8, 2.3)).toBe(true)
  })
})

describe('cellDistanceKm (entre centres de cellules)', () => {
  it('0 pour la même cellule', () => expect(cellDistanceKm({ lat: 48.86, lon: 2.34 }, { lat: 48.86, lon: 2.34 })).toBe(0))
  it('une cellule standard voisine au nord = ~2,2 km', () => {
    expect(cellDistanceKm({ lat: 48.86, lon: 2.34 }, { lat: 48.88, lon: 2.34 })).toBeCloseTo(2.23, 1)
  })
  it('tient compte de la latitude pour la longitude', () => {
    const d = cellDistanceKm({ lat: 60, lon: 10 }, { lat: 60, lon: 10.1 })
    expect(d).toBeCloseTo(5.57, 1) // cos(60°) = 0,5
  })
  it('est symétrique', () => {
    const a = { lat: 48.86, lon: 2.34 }
    const b = { lat: 48.9, lon: 2.4 }
    expect(cellDistanceKm(a, b)).toBeCloseTo(cellDistanceKm(b, a), 6)
  })
})

describe('distanceLabel', () => {
  it('même cellule : dans votre quartier', () => {
    expect(distanceLabel(0)).toBe('dans votre quartier')
    expect(distanceLabel(0, { sameCell: true, size: 'large' })).toBe('dans votre quartier')
    expect(distanceLabel(3, { sameCell: true })).toBe('dans votre quartier')
  })
  it('cellule voisine en standard : jamais moins de 2 km', () => {
    expect(distanceLabel(1.2)).toBe('à environ 2 km')
    expect(distanceLabel(2.2)).toBe('à environ 2 km')
    expect(distanceLabel(1.6, { size: 'standard' })).toBe('à environ 2 km')
  })
  it('au-delà : arrondi au km', () => {
    expect(distanceLabel(7.4)).toBe('à environ 7 km')
    expect(distanceLabel(12.6, { size: 'standard' })).toBe('à environ 13 km')
  })
  it('large : jamais moins de 5 km', () => {
    expect(distanceLabel(2.2, { size: 'large' })).toBe('à environ 5 km')
    expect(distanceLabel(5.3, { size: 'large' })).toBe('à environ 5 km')
    expect(distanceLabel(11.1, { size: 'large' })).toBe('à environ 11 km')
  })
  it('inconnue', () => {
    expect(distanceLabel(null)).toBe('distance inconnue')
    expect(distanceLabel(NaN)).toBe('distance inconnue')
  })
  it('aucun tilde ni sigle dans le libellé', () => {
    expect(distanceLabel(7.4)).not.toMatch(/[~°]/)
  })
})

describe('cellBounds', () => {
  it('encadre le centre', () => {
    const b = cellBounds({ lat: 48.86, lon: 2.34 }, 10)
    expect(b.latMin).toBeLessThan(48.86)
    expect(b.latMax).toBeGreaterThan(48.86)
    expect(b.lonMin).toBeLessThan(2.34)
    expect(b.lonMax - b.lonMin).toBeGreaterThan(b.latMax - b.latMin) // 1° de longitude est plus court à 49°N
  })
  it('les bornes sont sur la grille large : aucune coordonnée fine dans la requête', () => {
    for (const [lat, lon, r] of [[48.86, 2.34, 10], [47.22, 2.07, 50], [-33.86, 151.2, 1], [45.12, -1.17, 25]] as const) {
      const b = cellBounds({ lat, lon }, r)
      for (const v of [b.latMin, b.latMax]) expect(Math.abs(Math.round(v * 100) % 5)).toBe(0)
      for (const v of [b.lonMin, b.lonMax]) expect(Math.abs(Math.round(v * 100) % 7)).toBe(0)
      for (const v of Object.values(b)) expect(String(v)).toMatch(/^-?\d+(\.\d{1,2})?$/)
    }
  })
  it('garde une marge : le centre d’une cellule large à la limite du rayon reste dans le rectangle', () => {
    const c = { lat: 48.86, lon: 2.34 }
    const b = cellBounds(c, 10)
    const north = roundCell(48.86 + 10 / 111.32, 2.34, 'large')
    expect(north.lat).toBeLessThanOrEqual(b.latMax)
    const east = roundCell(48.86, 2.34 + 10 / (111.32 * Math.cos((48.86 * Math.PI) / 180)), 'large')
    expect(east.lon).toBeLessThanOrEqual(b.lonMax)
    expect(CELL_SLACK_KM).toBeGreaterThanOrEqual(2.8) // demi-diagonale d'une cellule large
  })
})
