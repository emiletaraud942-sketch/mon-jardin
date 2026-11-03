import { describe, expect, it } from 'vitest'
import type { Garden, Plant, Species } from '../types'
import { SPECIES } from '../data/species'
import { plainReason } from './plain'
import { scoreSpecies } from './planting'

describe('plainReason', () => {
  it('reformule les libellés connus', () => {
    expect(plainReason('Ensoleillement adapté (6,5 h/j, plein-soleil)')).toBe('Assez de soleil ici : environ 6,5 h par jour')
    expect(plainReason('Ensoleillement peu adapté (2 h/j, ombre ; aime : plein-soleil, mi-ombre)')).toBe(
      'Pas le bon soleil ici : environ 2 h par jour (ombre) ; elle préfère plein soleil ou soleil par moments',
    )
    expect(plainReason("Fixateur d'azote à proximité : fève")).toMatch(/nourrit le sol/)
    expect(plainReason('Rusticité limite (-3 °C, hivers ≈ -9 °C observés)')).toBe('Craint le froid : elle supporte -3 °C et vos hivers descendent vers -9 °C')
    expect(plainReason('Rusticité limite (-3 °C, hivers ≈ -9 °C estimés)')).toMatch(/\(estimation\)$/)
    expect(plainReason('Rustique dans votre climat')).toBe('Résiste bien au froid de chez vous')
    expect(plainReason('Sol argileux peu adapté (préfère : limoneux, humifere)')).toBe('Votre sol (argileux) lui convient moins ; elle préfère limoneux ou humifere')
  })

  it('texte inconnu : gardé, mots techniques remplacés', () => {
    expect(plainReason('Ensoleillement limite pour tomate (3 h/j).')).toBe('Ensoleillement limite pour tomate (3 h de soleil par jour).')
    expect(plainReason('Autre chose')).toBe('Autre chose')
  })

  it('ne laisse aucun jargon dans les libellés produits par le moteur (146 fiches, soleil, froid, sol, pente)', () => {
    const jargon = /h\/j|mi-ombre|plein-soleil|Rusticité|Fixateur|≈|art\. 671|préfère : |aime : /
    const neighbors: Plant[] = SPECIES.slice(0, 12).map((s, i) => ({
      id: `n${i}`, gardenId: 'g', speciesId: s.id, position: { x: i * 0.4, y: 0 }, plantedAt: '2024-01-01', status: 'en-place', photos: [],
    }))
    const speciesById: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]))
    const garden: Garden = {
      id: 'g', name: 'T', address: '', center: { lon: 2.35, lat: 48.85 }, createdAt: '2026-01-01', sol: 'argileux', lastFrostDoy: 110,
      parcel: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }],
      climate: { zone: '7b', minAbsC: -14, rainMmPerYear: 700 },
    }
    let seen = 0
    for (const sunHours of [1, 4.5, 8]) {
      for (const sp of SPECIES) {
        const r = scoreSpecies(sp, { garden, plants: neighbors, speciesById, spot: { x: 9.5, y: 0.2 }, sunHours, slopePct: 20, today: new Date(2026, 4, 10) })
        for (const f of r.factors) {
          seen++
          const out = plainReason(f.label)
          expect(out, f.label).not.toMatch(jargon)
        }
      }
    }
    expect(seen).toBeGreaterThan(500)
  })
})
