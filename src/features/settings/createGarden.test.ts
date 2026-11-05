import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/ign', () => ({
  fetchParcel: vi.fn(async () => null),
  fetchBuildings: vi.fn(async () => []),
  fetchTerrain: vi.fn(async () => {
    throw new Error('hors ligne')
  }),
}))
const fetchClimate = vi.fn()
vi.mock('../../lib/weather', () => ({ fetchClimate: (...a: unknown[]) => fetchClimate(...a) }))

import { buildGarden } from './createGarden'

const place = { label: '1 rue Test', lon: 4.83, lat: 45.76 }

describe('buildGarden : climat', () => {
  it('pose la zone (sans préfixe), la pluie arrondie et le froid observé', async () => {
    fetchClimate.mockResolvedValueOnce({ lastFrostDoy: 100, firstFrostDoy: 300, rainMmPerYear: 646.7, hottestMonth: 7, zone: 'Rusticité USDA 8a', minAbsC: -9 })
    const g = await buildGarden(place, 'Test', () => {})
    expect(g.climateZone).toBe('8a')
    expect(g.rainMmPerYear).toBe(647)
    expect(g.minAbsC).toBe(-9)
  })
  it('climat en échec : rien n’est posé, la création continue', async () => {
    fetchClimate.mockRejectedValueOnce(new Error('hors ligne'))
    const g = await buildGarden(place, 'Test', () => {})
    expect(g.climateZone).toBeUndefined()
    expect(g.rainMmPerYear).toBeUndefined()
  })
  it('« Actualiser » : un échec garde le climat déjà connu', async () => {
    fetchClimate.mockRejectedValueOnce(new Error('hors ligne'))
    const existing = { id: 'g', name: 'T', address: '', center: { lon: 4.83, lat: 45.76 }, createdAt: '2026-01-01', climateZone: '7b', rainMmPerYear: 800 }
    const g = await buildGarden(place, 'T', () => {}, existing)
    expect(g.climateZone).toBe('7b')
    expect(g.rainMmPerYear).toBe(800)
  })
})
