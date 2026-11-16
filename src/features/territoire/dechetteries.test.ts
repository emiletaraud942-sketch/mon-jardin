import { describe, expect, it } from 'vitest'
import { DECHETTERIES, distanceKm, nearestDechetteries } from './dechetteries'

describe('déchetteries de la Métropole', () => {
  it('15 points, tous dans la Métropole (autour de Rouen) et avec une adresse', () => {
    expect(DECHETTERIES).toHaveLength(15)
    for (const d of DECHETTERIES) {
      expect(d.lat, d.nom).toBeGreaterThan(49.2)
      expect(d.lat, d.nom).toBeLessThan(49.6)
      expect(d.lon, d.nom).toBeGreaterThan(0.7)
      expect(d.lon, d.nom).toBeLessThan(1.3)
      expect(d.adresse.length).toBeGreaterThan(3)
    }
  })
  it('la plus proche du centre de Rouen est celle de Rouen', () => {
    const [first] = nearestDechetteries({ lon: 1.0993, lat: 49.4432 }, 3)
    expect(first.d.nom).toBe('Rouen')
    expect(first.km).toBeLessThan(2)
  })
  it('trie par distance et rend 3 résultats par défaut', () => {
    const r = nearestDechetteries({ lon: 1.03, lat: 49.3 })
    expect(r).toHaveLength(3)
    expect(r[0].km).toBeLessThanOrEqual(r[1].km)
    expect(r[1].km).toBeLessThanOrEqual(r[2].km)
  })
  it('calcule une distance plausible (Rouen - Elbeuf ≈ 17 km)', () => {
    const km = distanceKm({ lon: 1.0993, lat: 49.4432 }, { lat: 49.2897, lon: 1.0036 })
    expect(km).toBeGreaterThan(15)
    expect(km).toBeLessThan(20)
  })
})
