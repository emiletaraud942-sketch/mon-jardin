import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../data/species'
import { filterSpecies } from './SpeciesPicker'
import { riskTypes } from './RiskNotes'

describe('riskTypes', () => {
  it('liste sans doublon, toxique d’abord', () => {
    expect(riskTypes(SPECIES_BY_ID.robinier)).toEqual(['toxique', 'envahissante', 'epineuse'])
    expect(riskTypes(SPECIES_BY_ID.laitue)).toEqual([])
  })
})

describe('filterSpecies', () => {
  const ids = (q: string, f = {}) => filterSpecies(q, f).map((s) => s.id)
  it('filtre par exposition', () => {
    const ombre = filterSpecies('', { sun: 'ombre' })
    expect(ombre.length).toBeGreaterThan(0)
    expect(ombre.every((s) => s.soleil.includes('ombre'))).toBe(true)
    expect(ids('', { sun: 'ombre' })).toContain('hortensia')
    expect(ids('', { sun: 'ombre' })).not.toContain('tomate')
  })
  it('« comestibles » écarte le rosier et l’hortensia', () => {
    expect(ids('', { edible: true })).not.toContain('rosier')
    expect(ids('', { edible: true })).toContain('tomate')
  })
  it('« sans risque connu » écarte les plantes signalées', () => {
    const sures = ids('', { safe: true })
    expect(sures).toContain('laitue')
    for (const id of ['rhubarbe', 'menthe', 'thuya', 'rosier']) expect(sures).not.toContain(id)
  })
  it('les filtres se combinent avec la recherche par nom usuel', () => {
    expect(ids('salade', { safe: true })).toEqual(expect.arrayContaining(['laitue']))
    expect(ids('pomme', { category: 'fruitier' })).toContain('pommier')
    expect(ids('pomme', { category: 'legume' })).not.toContain('pommier')
  })
})
