import { describe, expect, it } from 'vitest'
import { SPECIES } from '../data/species'
import type { Identification } from './plantnet'
import { CONFIDENT_IN_GARDEN, CONFIDENT_NEARBY, CONFIDENT_SCORE, genusHint, isConfident, rankScore, rerank } from './identifyRank'

const sp = (id: string) => SPECIES.find((s) => s.id === id)!
const exotic = (latin: string, score: number): Identification => ({ latin, score, commonNames: [], approx: false })
const known = (id: string, score: number, approx = false): Identification => ({ latin: sp(id).nomLatin, score, commonNames: [], species: sp(id), approx })

describe('rerank', () => {
  it('une espèce du catalogue passe devant un exotique un peu mieux noté', () => {
    const out = rerank([exotic('Liquidambar styraciflua', 0.15), known('pommier', 0.12)])
    expect(out[0].latin).toBe(sp('pommier').nomLatin)
  })
  it('une espèce déjà dans le jardin passe devant une espèce seulement du catalogue', () => {
    const out = rerank([known('poirier', 0.14), known('pommier', 0.1)], { gardenSpeciesIds: new Set(['pommier']) })
    expect(out[0].species?.id).toBe('pommier')
  })
  it('ne change pas l’ordre quand rien ne distingue : tri stable', () => {
    const list = [exotic('A a', 0.3), exotic('B b', 0.3), exotic('C c', 0.3)]
    expect(rerank(list).map((r) => r.latin)).toEqual(['A a', 'B b', 'C c'])
  })
  it('un score très faible ne devient pas premier à cause du catalogue', () => {
    const out = rerank([exotic('Quercus rubra', 0.6), known('pommier', 0.05)])
    expect(out[0].latin).toBe('Quercus rubra')
  })
  it('ne touche pas aux scores affichés', () => {
    const out = rerank([known('pommier', 0.12)], { gardenSpeciesIds: new Set(['pommier']) })
    expect(out[0].score).toBe(0.12)
    expect(rankScore(out[0], { gardenSpeciesIds: new Set(['pommier']) })).toBeGreaterThan(0.12)
  })
  it('un rapprochement de genre seulement pèse moins qu’une espèce exacte', () => {
    expect(rankScore(known('pommier', 0.1, true))).toBeLessThan(rankScore(known('pommier', 0.1, false)))
  })
})

describe('isConfident', () => {
  it('liste vide : pas sûr', () => expect(isConfident([])).toBe(false))
  it('copalme à 15 % : pas sûr', () => expect(isConfident([exotic('Liquidambar styraciflua', 0.15)])).toBe(false))
  it(`à ${CONFIDENT_SCORE * 100} % ou plus : sûr`, () => expect(isConfident([exotic('X y', CONFIDENT_SCORE)])).toBe(true))
  it('espèce déjà dans le jardin : seuil plus bas', () => {
    const ctx = { gardenSpeciesIds: new Set(['pommier']) }
    expect(isConfident([known('pommier', CONFIDENT_IN_GARDEN)], ctx)).toBe(true)
    expect(isConfident([known('pommier', CONFIDENT_IN_GARDEN - 0.05)], ctx)).toBe(false)
    expect(isConfident([known('pommier', CONFIDENT_IN_GARDEN)])).toBe(false)
  })
})

describe('genusHint', () => {
  it('plusieurs espèces du même genre qui totalisent assez : dit le genre', () => {
    expect(genusHint([exotic('Acer palmatum', 0.07), exotic('Acer platanoides', 0.07), exotic('Acer campestre', 0.05), exotic('Acer pseudoplatanus', 0.1), exotic('Acer rubrum', 0.2)])).toBe('Probablement du genre Acer')
  })
  it('une seule espèce du genre : rien', () => expect(genusHint([exotic('Acer palmatum', 0.6)])).toBeUndefined())
  it('genre trop dispersé : rien', () => expect(genusHint([exotic('Acer a', 0.1), exotic('Acer b', 0.1), exotic('Prunus c', 0.1)])).toBeUndefined())
  it('liste vide : rien', () => expect(genusHint([])).toBeUndefined())
})

describe('plantes déjà posées à côté (nouveau passage)', () => {
  it('l’espèce plantée à 2 m passe devant, même un peu moins bien notée', () => {
    const out = rerank([known('poirier', 0.16), known('pommier', 0.12)], { gardenSpeciesIds: new Set(['pommier', 'poirier']), nearSpeciesIds: new Set(['pommier']) })
    expect(out[0].species?.id).toBe('pommier')
  })
  it('ne compte pas pour une espèce voisine seulement par le genre', () => {
    const near = { nearSpeciesIds: new Set(['pommier']) }
    expect(rankScore(known('pommier', 0.1, true), near)).toBe(rankScore(known('pommier', 0.1, true)))
  })
  it('seuil de confiance plus bas pour une plante déjà posée à côté', () => {
    const ctx = { nearSpeciesIds: new Set(['pommier']) }
    expect(isConfident([known('pommier', CONFIDENT_NEARBY)], ctx)).toBe(true)
    expect(isConfident([known('pommier', CONFIDENT_NEARBY - 0.03)], ctx)).toBe(false)
    expect(isConfident([known('pommier', CONFIDENT_NEARBY)])).toBe(false)
  })
})
