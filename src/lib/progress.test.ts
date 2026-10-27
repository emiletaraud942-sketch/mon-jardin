import { describe, expect, it } from 'vitest'
import type { Garden, Plant } from '../types'
import { computeProgress, firstSteps, nextStep, suggestedMode, type ProgressOpts } from './progress'

const SPECIES: ProgressOpts['speciesById'] = {
  pommier: { strate: 'arbre-bas' },
  chene: { strate: 'canopee' },
  groseillier: { strate: 'arbuste' },
  tomate: { strate: 'herbacee' },
  fraisier: { strate: 'couvre-sol' },
}
const opts = (o: Partial<ProgressOpts> = {}): ProgressOpts => ({ speciesById: SPECIES, ...o })

const garden = (g: Partial<Garden> = {}): Garden => ({ id: 'g1', name: 'J', address: 'a', center: { lon: 0, lat: 0 }, createdAt: '2026-01-01', ...g })
let n = 0
const plant = (speciesId: string, p: Partial<Plant> = {}): Plant => ({
  id: 'p' + n++,
  gardenId: 'g1',
  speciesId,
  position: { x: 0, y: 0 },
  plantedAt: '2026-01-01',
  status: 'en-place',
  photos: [],
  ...p,
})
const step = (g: Garden, plants: Plant[], id: string, o: Partial<ProgressOpts> = {}) => computeProgress(g, plants, opts(o)).steps.find((s) => s.id === id)!

describe('computeProgress : étapes', () => {
  it('jardin vide : seule l’adresse est faite (1 sur 5)', () => {
    const p = computeProgress(garden(), [], opts())
    expect(p.steps).toHaveLength(5)
    expect(p.doneCount).toBe(1)
    expect(p.total).toBe(5)
    expect(p.steps.filter((s) => s.done).map((s) => s.id)).toEqual(['adresse'])
    expect(p.percent).toBe(20)
    expect(p.next?.id).toBe('donnees')
    expect(p.placedCount).toBe(0)
  })

  it('parcelle et bâtiments : il faut les deux (une liste vide de bâtiments compte)', () => {
    const parcel = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    expect(step(garden({ parcel }), [], 'donnees').done).toBe(false)
    expect(step(garden({ buildings: [] }), [], 'donnees').done).toBe(false)
    expect(step(garden({ parcel: [], buildings: [] }), [], 'donnees').done).toBe(false)
    expect(step(garden({ parcel, buildings: [] }), [], 'donnees').done).toBe(true)
  })

  it('premier arbre : canopée, arbre bas ou arbuste, en place seulement', () => {
    for (const sp of ['pommier', 'chene', 'groseillier']) expect(step(garden(), [plant(sp)], 'premier-arbre').done).toBe(true)
    expect(step(garden(), [plant('tomate')], 'premier-arbre').done).toBe(false)
    expect(step(garden(), [plant('pommier', { status: 'projet' })], 'premier-arbre').done).toBe(false)
    expect(step(garden(), [plant('pommier', { status: 'mort' })], 'premier-arbre').done).toBe(false)
    expect(step(garden(), [plant('inconnue')], 'premier-arbre').done).toBe(false)
  })

  it('5 plantes placées : les projets et les plantes d’un autre jardin ne comptent pas', () => {
    const four = Array.from({ length: 4 }, () => plant('tomate'))
    expect(step(garden(), four, 'cinq-plantes').done).toBe(false)
    expect(step(garden(), [...four, plant('tomate')], 'cinq-plantes').done).toBe(true)
    expect(step(garden(), [...four, plant('tomate', { status: 'projet' })], 'cinq-plantes').done).toBe(false)
    expect(step(garden(), [...four, plant('tomate', { gardenId: 'autre' })], 'cinq-plantes').done).toBe(false)
    expect(step(garden(), four, 'cinq-plantes').hint).toContain('4 sur 5')
  })

  it('ni la photo ni la vue 3D ne comptent dans la jauge', () => {
    const ids = computeProgress(garden(), [], opts()).steps.map((x) => x.id)
    expect(ids).toEqual(['adresse', 'donnees', 'premier-arbre', 'cinq-plantes', 'sol'])
  })

  it('sol', () => {
    expect(step(garden(), [], 'sol').done).toBe(false)
    expect(step(garden({ sol: 'argileux' }), [], 'sol').done).toBe(true)
  })

  it('« Premiers pas » : 3 étapes qui demandent un geste', () => {
    expect(firstSteps(computeProgress(garden(), [], opts())).map((x) => x.id)).toEqual(['premier-arbre', 'cinq-plantes', 'sol'])
  })

  it('les étapes faites n’ont pas de bouton d’action utile, les autres en ont un', () => {
    const p = computeProgress(garden(), [], opts())
    expect(p.steps.find((s) => s.id === 'adresse')?.action).toBeUndefined()
    for (const s of p.steps.filter((x) => !x.done)) expect(s.action?.label).toBeTruthy()
  })

  it('jardin complet : 100 %, plus de prochaine étape', () => {
    const parcel = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
    const plants = [plant('pommier'), ...Array.from({ length: 4 }, () => plant('tomate'))]
    const p = computeProgress(garden({ parcel, buildings: [], sol: 'limoneux' }), plants, opts())
    expect(p.percent).toBe(100)
    expect(p.next).toBeUndefined()
    expect(p.steps.every((s) => s.done)).toBe(true)
  })
})

describe('pourcentage', () => {
  it('arrondit étapes faites / total', () => {
    const g = garden({ sol: 'sableux' })
    expect(computeProgress(g, [], opts()).percent).toBe(40) // 2 sur 5
    expect(computeProgress(g, [plant('pommier')], opts()).percent).toBe(60) // 3 sur 5
  })
})

describe('suggestedMode', () => {
  const parcel = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
  const three = [plant('pommier'), plant('tomate'), plant('tomate')]
  const ready = garden({ parcel, buildings: [], sol: 'argileux' }) // adresse + données + sol + arbre = 4 sur 5 (80 %)

  it('jardin vide : « jardin »', () => {
    expect(suggestedMode(computeProgress(garden(), [], opts()))).toBe('jardin')
  })
  it('80 % et 3 plantes : « entretenir »', () => {
    const p = computeProgress(ready, three, opts())
    expect(p.percent).toBe(80)
    expect(suggestedMode(p)).toBe('entretenir')
  })
  it('80 % mais moins de 3 plantes : « jardin »', () => {
    expect(suggestedMode(computeProgress(ready, three.slice(0, 2), opts()))).toBe('jardin')
  })
  it('3 plantes mais moins de 70 % : « jardin »', () => {
    expect(suggestedMode(computeProgress(garden(), three, opts()))).toBe('jardin')
  })
  it('« planifier » seulement si Entretien a déjà été ouvert', () => {
    expect(suggestedMode(computeProgress(ready, three, opts({ openedEntretien: true })))).toBe('planifier')
    expect(suggestedMode(computeProgress(garden(), three, opts({ openedEntretien: true })))).toBe('jardin')
  })
})

describe('nextStep : une seule prochaine étape', () => {
  const full = (): Garden => garden({ parcel: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], buildings: [], sol: 'argileux' } as Partial<Garden>)
  const ctx = { demo: false, openTasks: 0 }
  const next = (g: Garden, plants: Plant[], c = ctx) => nextStep(computeProgress(g, plants, opts()), c)

  it('jardin d’exemple : créer son vrai jardin, avant tout le reste', () => {
    expect(next(garden(), [], { demo: true, openTasks: 4 })?.kind).toBe('creer')
  })

  it('jardin vide : placer le premier arbre (avant les données manquantes)', () => {
    const n = next(garden(), [])
    expect(n).toMatchObject({ kind: 'placer', title: 'Placez votre premier arbre', action: 'Ajouter une plante' })
  })

  it('un arbre placé : compte les plantes qui manquent pour arriver à 5', () => {
    expect(next(full(), [plant('pommier')])?.title).toBe('Placez 4 plantes de plus')
    expect(next(full(), [plant('pommier'), plant('tomate'), plant('tomate'), plant('tomate')])?.title).toBe('Placez 1 plante de plus')
  })

  it('une plante sans arbre : le premier arbre reste proposé', () => {
    expect(next(full(), [plant('tomate')])?.title).toBe('Placez votre premier arbre')
  })

  it('5 plantes : le sol, puis les données du terrain, puis les tâches', () => {
    const five = [plant('pommier'), plant('tomate'), plant('tomate'), plant('tomate'), plant('tomate')]
    expect(next({ ...full(), sol: undefined }, five)?.kind).toBe('sol')
    expect(next({ ...full(), parcel: undefined }, five)?.kind).toBe('donnees')
    expect(next(full(), five, { demo: false, openTasks: 1 })).toMatchObject({ kind: 'taches', title: '1 chose à faire cette semaine' })
    expect(next(full(), five, { demo: false, openTasks: 3 })?.title).toBe('3 choses à faire cette semaine')
  })

  it('tout est fait et aucune tâche : rien à proposer', () => {
    const five = [plant('pommier'), plant('tomate'), plant('tomate'), plant('tomate'), plant('tomate')]
    expect(next(full(), five)).toBeUndefined()
  })
})
