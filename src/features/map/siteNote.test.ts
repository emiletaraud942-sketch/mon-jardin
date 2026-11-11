import { describe, expect, it } from 'vitest'
import type { TerrainGrid } from '../../types'
import { humidityEstimate, reliefDelta, siteLines } from './siteNote'

/** Grille carrée de côté 2 × size, altitude donnée par f(x, y). */
function grid(f: (x: number, y: number) => number, size = 20, n = 41): TerrainGrid {
  const step = (2 * size) / (n - 1)
  const heights: number[] = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights.push(f(-size + i * step, -size + j * step))
  return { size, n, heights } as TerrainGrid
}
const flat = grid(() => 0)
const bowl = grid((x, y) => 0.02 * (x * x + y * y)) // le centre est le point le plus bas
const hill = grid((x, y) => -0.02 * (x * x + y * y)) // le centre est le point le plus haut
const slope = grid((_x, y) => 0.05 * y) // monte vers le nord : l'eau descend vers le sud

describe('relief : creux ou butte', () => {
  it('plat : écart nul ; creux : positif ; butte : négatif', () => {
    expect(reliefDelta(flat, { x: 0, y: 0 })).toBeCloseTo(0, 6)
    expect(reliefDelta(bowl, { x: 0, y: 0 })).toBeGreaterThan(0.5)
    expect(reliefDelta(hill, { x: 0, y: 0 })).toBeLessThan(-0.5)
  })
})

describe('humidité estimée', () => {
  it('sans aucun indice : moyenne, et le dit', () => {
    const h = humidityEstimate({ point: { x: 0, y: 0 } })
    expect(h.level).toBe('moyen')
    expect(h.reasons).toEqual([])
  })
  it('un creux est plus humide qu’une butte, à sol et pluie égaux', () => {
    const creux = humidityEstimate({ terrain: bowl, point: { x: 0, y: 0 }, sol: 'limoneux' })
    const butte = humidityEstimate({ terrain: hill, point: { x: 0, y: 0 }, sol: 'limoneux' })
    expect(['frais', 'humide']).toContain(creux.level)
    expect(butte.level).toBe('sec')
    expect(creux.reasons.join(' ')).toMatch(/creux/)
    expect(butte.reasons.join(' ')).toMatch(/butte/)
  })
  it('le sol compte : sableux sèche, argileux retient', () => {
    expect(humidityEstimate({ terrain: flat, point: { x: 0, y: 0 }, sol: 'sableux' }).level).toBe('sec')
    expect(humidityEstimate({ terrain: flat, point: { x: 0, y: 0 }, sol: 'argileux' }).level).toBe('frais')
  })
  it('la pluie compte, mais valeurs absurdes ignorées', () => {
    expect(humidityEstimate({ terrain: flat, point: { x: 0, y: 0 }, rainMmPerYear: 1200 }).level).toBe('frais')
    expect(humidityEstimate({ terrain: flat, point: { x: 0, y: 0 }, rainMmPerYear: 450 }).level).toBe('sec')
    expect(humidityEstimate({ terrain: flat, point: { x: 0, y: 0 }, rainMmPerYear: NaN }).level).toBe('moyen')
    expect(humidityEstimate({ terrain: flat, point: { x: 0, y: 0 }, rainMmPerYear: 0 }).level).toBe('moyen')
  })
  it('creux + argile + région pluvieuse : humide', () => {
    expect(humidityEstimate({ terrain: bowl, point: { x: 0, y: 0 }, sol: 'argileux', rainMmPerYear: 1000 }).level).toBe('humide')
  })
  it('les mots restent simples (pas de chiffre, pas de jargon)', () => {
    const h = humidityEstimate({ terrain: bowl, point: { x: 0, y: 0 }, sol: 'argileux', rainMmPerYear: 1000 })
    expect(h.text).not.toMatch(/\d/)
    for (const r of h.reasons) expect(r).not.toMatch(/topograph|hydrom|texture/i)
  })
})

describe('fiche « Ici »', () => {
  it('trois lignes avec soleil, relief et sol ; chaque humidité est dite « estimation »', () => {
    const l = siteLines({ sunHours: 7, terrain: slope, point: { x: 0, y: 0 }, sol: 'limoneux' })
    expect(l.map((x) => x.kind)).toEqual(['soleil', 'pente', 'eau'])
    expect(l[0].text).toMatch(/7 h de soleil/)
    expect(l[0].detail).toBe('plein soleil')
    expect(l[1].text).toBe('Pente douce')
    expect(l[1].detail).toBe('descend vers le sud')
    expect(l[2].detail).toMatch(/^estimation/)
  })
  it('sans relief : pas de ligne de pente ; sans soleil calculé : pas de ligne de soleil ; l’humidité reste', () => {
    const l = siteLines({ point: { x: 0, y: 0 } })
    expect(l.map((x) => x.kind)).toEqual(['eau'])
    expect(l[0].detail).toMatch(/sans indice/)
  })
  it('ombre et mi-ombre', () => {
    expect(siteLines({ sunHours: 1, point: { x: 0, y: 0 } })[0].detail).toBe('ombre')
    expect(siteLines({ sunHours: 4, point: { x: 0, y: 0 } })[0].detail).toBe('mi-ombre')
  })
  it('terrain plat : « Terrain plat » sans direction', () => {
    const l = siteLines({ terrain: flat, point: { x: 3, y: 3 } })
    expect(l[0].text).toBe('Terrain plat')
    expect(l[0].detail).toBeUndefined()
  })
})
