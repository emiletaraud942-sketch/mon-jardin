import { describe, expect, it } from 'vitest'
import { SPECIES } from '../data/species'
import { normalize, searchIn } from './speciesSearch'

const find = (q: string) => searchIn(SPECIES, q)

describe('normalize', () => {
  it('gère accents, ligatures, apostrophes et traits d’union', () => {
    expect(normalize('Cœur-de-bœuf')).toBe('coeur de boeuf')
    expect(normalize('L’Æther')).toBe('l aether')
    expect(normalize('  Mûre  ')).toBe('mure')
  })
})

describe('recherche d’une plante', () => {
  it('« pomme » met le pommier en tête', () => {
    expect(find('pomme')[0].id).toBe('pommier')
    expect(find('Pommes')[0].id).toBe('pommier')
  })
  it.each(['fraise', 'framboise', 'cerise', 'figue', 'noix', 'mûre', 'myrtille', 'tomate cerise', 'framboises', 'Mûres'])('« %s » trouve quelque chose', (q) => {
    expect(find(q).length).toBeGreaterThan(0)
  })
  it('« tomate cerise » met la tomate en tête', () => {
    expect(find('tomate cerise')[0].id).toMatch(/tomate/)
  })
  it('nom exact avant alias, alias avant préfixe', () => {
    const l = searchIn(
      [
        { id: 'c', nomCommun: 'Poirier pomme', nomLatin: 'x', categorie: 'fruitier' },
        { id: 'b', nomCommun: 'Pommier', nomLatin: 'y', categorie: 'fruitier', alias: ['pomme'] },
        { id: 'a', nomCommun: 'Pomme', nomLatin: 'z', categorie: 'fruitier' },
        { id: 'd', nomCommun: 'Pommette', nomLatin: 'w', categorie: 'fruitier' },
      ] as never,
      'pomme',
    )
    expect(l.map((s) => s.id)).toEqual(['a', 'b', 'd', 'c'])
  })
  it('rend tout dans l’ordre des fiches sans requête', () => {
    expect(find('')).toEqual(SPECIES)
  })
  it('filtre par catégorie', () => {
    const l = searchIn(SPECIES, 'pomme', 'fruitier')
    expect(l.every((s) => s.categorie === 'fruitier')).toBe(true)
  })
})
