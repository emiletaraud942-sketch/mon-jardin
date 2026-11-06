import { describe, expect, it } from 'vitest'
import { SPECIES } from '../../data/species'
import type { Garden, Species } from '../../types'
import { applyFilters, FILTERS, isEasy, matches } from './catalogueFilters'

const garden = { id: 'g', name: 'J', center: { lon: 2, lat: 48 } } as Garden
const sp = (o: Partial<Species>): Species => ({ id: 'x', nomCommun: 'X', comestible: false, soleil: ['plein-soleil'], eau: 'moyen', rusticiteC: -15, taches: [], ...o }) as Species

describe('filtres du catalogue', () => {
  it('comestible, mellifère et ombre lisent les champs de la fiche', () => {
    expect(matches(sp({ comestible: true }), 'comestible', garden, 5)).toBe(true)
    expect(matches(sp({}), 'comestible', garden, 5)).toBe(false)
    expect(matches(sp({ mellifere: true }), 'melliferes', garden, 5)).toBe(true)
    expect(matches(sp({}), 'melliferes', garden, 5)).toBe(false)
    expect(matches(sp({ soleil: ['mi-ombre'] }), 'ombre', garden, 5)).toBe(true)
    expect(matches(sp({ soleil: ['ombre'] }), 'ombre', garden, 5)).toBe(true)
    expect(matches(sp({ soleil: ['plein-soleil'] }), 'ombre', garden, 5)).toBe(false)
  })

  it('facile : rustique, peu d’eau, peu de soins, pas envahissante', () => {
    expect(isEasy(sp({}))).toBe(true)
    expect(isEasy(sp({ rusticiteC: -2 }))).toBe(false)
    expect(isEasy(sp({ eau: 'eleve' }))).toBe(false)
    expect(isEasy(sp({ taches: new Array(5).fill({}) }))).toBe(false)
    expect(isEasy(sp({ avertissements: [{ type: 'envahissante', texte: 'S’étend.' }] }))).toBe(false)
  })

  it('sans risque connu : aucun avertissement sur la fiche', () => {
    expect(matches(sp({}), 'sans-risque', garden, 5)).toBe(true)
    expect(matches(sp({ avertissements: [{ type: 'toxique', texte: 'Toxique.' }] }), 'sans-risque', garden, 5)).toBe(false)
  })

  it('ce mois-ci : semis ou plantation du mois', () => {
    const s = sp({ semisAbri: [3], plantation: [5, 6] })
    expect(matches(s, 'maintenant', garden, 3)).toBe(true)
    expect(matches(s, 'maintenant', garden, 6)).toBe(true)
    expect(matches(s, 'maintenant', garden, 9)).toBe(false)
  })

  it('combine les filtres (ET) et ne change rien sans filtre', () => {
    const list = [sp({ id: 'a', comestible: true, mellifere: true }), sp({ id: 'b', comestible: true }), sp({ id: 'c', mellifere: true })]
    expect(applyFilters(list, [], garden, 5)).toBe(list)
    expect(applyFilters(list, ['comestible'], garden, 5).map((s) => s.id)).toEqual(['a', 'b'])
    expect(applyFilters(list, ['comestible', 'melliferes'], garden, 5).map((s) => s.id)).toEqual(['a'])
  })

  it('chaque filtre garde des plantes de la vraie base, sans tout garder', () => {
    for (const f of FILTERS) {
      const n = applyFilters(SPECIES, [f.id], garden, 4).length
      expect(n, f.id).toBeGreaterThan(0)
      expect(n, f.id).toBeLessThan(SPECIES.length)
    }
  })
})
