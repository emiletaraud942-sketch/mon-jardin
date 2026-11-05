import { describe, expect, it } from 'vitest'
import type { Plant, Species } from '../types'
import { canMarkHarvested, seasonOverPlants } from './annuelles'

const base: Omit<Species, 'id' | 'nomCommun'> = {
  nomLatin: '', famille: 'Test', categorie: 'legume', strate: 'herbacee', vivace: false, comestible: true, soleil: ['plein-soleil'],
  eau: 'moyen', rusticiteC: 2, hauteurAdulteM: 1, envergureAdulteM: 1, anneesMaturite: 1, espacementCm: 50,
  compagnons: [], antagonistes: [], taches: [], entretien: '', couleur: '#4a4',
}
const basilic: Species = { ...base, id: 'basilic', nomCommun: 'Basilic', recolte: [6, 7, 8, 9] }
const menthe: Species = { ...base, id: 'menthe', nomCommun: 'Menthe', vivace: true }
const pommier: Species = { ...base, id: 'pommier', nomCommun: 'Pommier', vivace: true, anneesMaturite: 5 }
const biennale: Species = { ...base, id: 'carotte-porte-graine', nomCommun: 'Carotte', anneesMaturite: 3 }
const speciesById = Object.fromEntries([basilic, menthe, pommier, biennale].map((s) => [s.id, s]))

let n = 0
const plant = (speciesId: string, extra: Partial<Plant> = {}): Plant => ({
  id: `p${++n}`, gardenId: 'g', speciesId, position: { x: n, y: 0 }, plantedAt: '2026-05-10', status: 'en-place', photos: [], ...extra,
})

describe('canMarkHarvested', () => {
  it('une annuelle en place peut l’être à tout moment', () => {
    const avant = canMarkHarvested(plant('basilic'), basilic, new Date(2026, 7, 1))
    expect(avant.ok).toBe(true)
    expect(avant.reason).toMatch(/arrachée|récolte est finie/)
    const apres = canMarkHarvested(plant('basilic'), basilic, new Date(2026, 10, 5)) // saison finie fin octobre
    expect(apres.ok).toBe(true)
    expect(apres.reason).toMatch(/saison est finie/)
  })
  it('une annuelle malade aussi', () => {
    expect(canMarkHarvested(plant('basilic', { status: 'malade' }), basilic, new Date(2026, 7, 1)).ok).toBe(true)
  })
  it('refuse une vivace, un arbre, une plante à maturité lente', () => {
    for (const [id, sp] of [['menthe', menthe], ['pommier', pommier], ['carotte-porte-graine', biennale]] as const) {
      const r = canMarkHarvested(plant(id), sp, new Date(2026, 7, 1))
      expect(r.ok, id).toBe(false)
      expect(r.reason).toMatch(/repart chaque année/)
    }
  })
  it('refuse un projet, une plante morte, une plante déjà récoltée, une espèce inconnue', () => {
    const d = new Date(2026, 7, 1)
    expect(canMarkHarvested(plant('basilic', { status: 'projet' }), basilic, d)).toMatchObject({ ok: false, reason: expect.stringMatching(/pas encore plantée/) })
    expect(canMarkHarvested(plant('basilic', { status: 'mort' }), basilic, d)).toMatchObject({ ok: false, reason: expect.stringMatching(/morte/) })
    expect(canMarkHarvested(plant('basilic', { status: 'recoltee' }), basilic, d)).toMatchObject({ ok: false, reason: expect.stringMatching(/déjà/) })
    expect(canMarkHarvested(plant('inconnue'), undefined, d).ok).toBe(false)
  })
  it('chaque raison tient en 20 mots au plus', () => {
    const d = new Date(2026, 10, 5)
    for (const p of [plant('basilic'), plant('menthe'), plant('basilic', { status: 'mort' })]) {
      expect(canMarkHarvested(p, speciesById[p.speciesId], d).reason.split(/\s+/).length).toBeLessThanOrEqual(20)
    }
  })
})

describe('seasonOverPlants', () => {
  it('propose les annuelles dont la saison est finie, pas les vivaces ni les récoltées', () => {
    const fini = plant('basilic')
    const recent = plant('basilic', { plantedAt: '2026-10-20' })
    const recoltee = plant('basilic', { status: 'recoltee' })
    const vivace = plant('menthe', { plantedAt: '2015-05-10' })
    const list = seasonOverPlants([fini, recent, recoltee, vivace], speciesById, new Date(2026, 10, 5))
    expect(list.map((p) => p.id)).toEqual([fini.id])
  })
})
