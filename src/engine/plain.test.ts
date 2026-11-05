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
    expect(plainReason('Rustique dans votre climat')).toBe('Résiste bien au froid de chez vous')
    expect(plainReason('Sol argileux peu adapté (préfère : limoneux, humifere)')).toBe('Votre sol (argileux) lui convient moins ; elle préfère limoneux ou humifère')
    expect(plainReason('Sol humifere apprécié')).toBe('Votre sol (humifère) lui convient')
  })

  it('froid : libellés actuels du moteur (observé et estimé)', () => {
    expect(plainReason('Rusticité limite (-3 °C, hiver le plus froid observé -9 °C)')).toBe(
      'Craint le froid : elle supporte -3 °C et votre hiver le plus froid est descendu à -9 °C',
    )
    expect(plainReason('Rusticité limite (-3 °C, hivers ≈ -9 °C estimés)')).toBe(
      'Craint le froid : elle supporte -3 °C et vos hivers descendent vers -9 °C (estimation)',
    )
  })

  it('texte inconnu : gardé, mots techniques remplacés', () => {
    expect(plainReason('Ensoleillement limite pour tomate (3 h/j).')).toBe('Ensoleillement limite pour tomate (3 h de soleil par jour).')
    expect(plainReason('Trop près : pommier à 1 m (il faudrait ~2 m).')).toBe('Trop près : pommier à 1 m (il faudrait environ 2 m).')
    expect(plainReason('Autre chose')).toBe('Autre chose')
  })

  it('ne change rien aux scores : le libellé d’origine reste la référence', () => {
    const label = 'Rustique dans votre climat'
    plainReason(label)
    expect(label).toBe('Rustique dans votre climat')
  })

  it('aucun jargon dans les libellés ni les avertissements du moteur (toutes les fiches, soleil, froid observé et estimé, sol, pente)', () => {
    const jargon = /h\/j|mi-ombre|plein-soleil|Rusticité|Fixateur|≈|~\d|humifere|préfère : |aime : /
    const neighbors: Plant[] = SPECIES.slice(0, 12).map((s, i) => ({
      id: `n${i}`, gardenId: 'g', speciesId: s.id, position: { x: 9 - i * 0.4, y: 0 }, plantedAt: '2024-01-01', status: 'en-place', photos: [],
    }))
    const speciesById: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]))
    const parcel = [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }]
    const gardens: Garden[] = [
      { id: 'g', name: 'T', address: '', center: { lon: 2.35, lat: 48.85 }, createdAt: '2026-01-01', sol: 'argileux', lastFrostDoy: 110, parcel, minAbsC: -14 }, // froid observé
      { id: 'g', name: 'T', address: '', center: { lon: 2.35, lat: 48.85 }, createdAt: '2026-01-01', sol: 'humifere', lastFrostDoy: 130, parcel }, // froid estimé
    ]
    let seen = 0
    const labels = new Set<string>()
    for (const garden of gardens) {
      for (const sunHours of [1, 4.5, 8]) {
        for (const sp of SPECIES) {
          const r = scoreSpecies(sp, { garden, plants: neighbors, speciesById, spot: { x: 9.5, y: 0.2 }, sunHours, slopePct: 20, today: new Date(2026, 4, 10) })
          for (const text of [...r.factors.map((f) => f.label), ...r.warnings]) {
            seen++
            labels.add(text.replace(/[\d,.-]+/g, '#'))
            expect(plainReason(text), text).not.toMatch(jargon)
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(1000)
    // les deux formes de rusticité ont bien été produites
    expect([...labels].some((l) => /hiver le plus froid observé/.test(l))).toBe(true)
    expect([...labels].some((l) => /hivers ≈ # °C estimés/.test(l))).toBe(true)
  })
})
