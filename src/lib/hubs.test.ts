import { describe, expect, it } from 'vitest'
import { FEATURES } from './features'
import { HUBS, readyToHarvest } from './hubs'

const words = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

describe('les trois parties de l’accueil', () => {
  it('sont Consommer, Entretenir, Cultiver, avec trois gros choix au plus', () => {
    expect(HUBS.map((h) => h.id).sort()).toEqual(['consommer', 'cultiver', 'entretenir'])
    for (const h of HUBS) expect(h.main.length).toBeLessThanOrEqual(3)
  })
  it('chaque choix lance une fonction du registre, avec une phrase courte', () => {
    for (const h of HUBS)
      for (const i of [...h.main, ...h.more]) {
        expect(FEATURES.some((f) => f.id === i.featureId), i.featureId).toBe(true)
        expect(words(i.phrase), i.phrase).toBeLessThanOrEqual(20)
      }
  })
  it('aucune fonction n’est répétée dans une même partie', () => {
    for (const h of HUBS) {
      const ids = [...h.main, ...h.more].map((i) => i.featureId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('readyToHarvest', () => {
  const species = { pommier: { nomCommun: 'Pommier', recolte: [9, 10] }, thym: { nomCommun: 'Thym', recolte: [4] } }
  const plants = [
    { speciesId: 'pommier', status: 'en-place' },
    { speciesId: 'pommier', status: 'en-place' },
    { speciesId: 'thym', status: 'en-place' },
    { speciesId: 'inconnu', status: 'en-place' },
  ]
  it('garde les plantes en place dont le mois est celui d’aujourd’hui, une fois par espèce', () => {
    expect(readyToHarvest(plants, species, 9)).toEqual(['Pommier'])
    expect(readyToHarvest(plants, species, 4)).toEqual(['Thym'])
    expect(readyToHarvest(plants, species, 1)).toEqual([])
  })
  it('ignore les plantes en projet ou récoltées', () => {
    expect(readyToHarvest([{ speciesId: 'pommier', status: 'projet' }], species, 9)).toEqual([])
    expect(readyToHarvest([{ speciesId: 'pommier', status: 'recoltee' }], species, 9)).toEqual([])
  })
})
