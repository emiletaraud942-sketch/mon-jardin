import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../data/species'
import type { Plant } from '../types'
import { canopyLook, mixHex, phaseOf, seasonDate, seasonSummary, SEASONS, SEASON_CHOICES, stateAtSeason } from './season'

const NOW = new Date(2026, 9, 29, 10) // 29 octobre 2026
const plant = (speciesId: string, extra: Partial<Plant> = {}): Plant => ({ id: speciesId, gardenId: 'g1', speciesId, position: { x: 0, y: 0 }, plantedAt: '2018-03-01', status: 'en-place', photos: [], ...extra })
const state = (id: string, choice: Parameters<typeof seasonDate>[0]) => stateAtSeason(plant(id), SPECIES_BY_ID[id], NOW, seasonDate(choice, NOW))

describe('seasonDate', () => {
  it('chaque saison tombe dans la bonne partie de l’année ; « aujourd’hui » donne la date du jour', () => {
    expect(seasonDate('hiver', NOW).getMonth()).toBe(0)
    expect(seasonDate('printemps', NOW).getMonth()).toBe(3)
    expect(seasonDate('ete', NOW).getMonth()).toBe(6)
    expect(seasonDate('automne', NOW).getMonth()).toBe(9)
    expect(seasonDate('aujourdhui', NOW)).toBe(NOW)
    expect(seasonDate(undefined, NOW)).toBe(NOW)
  })
  it('5 choix, dont « Aujourd’hui » en premier', () => {
    expect(SEASON_CHOICES.map((c) => c.label)).toEqual(['Aujourd’hui', 'Hiver', 'Printemps', 'Été', 'Automne'])
    expect(SEASONS).toHaveLength(4)
  })
})

describe('un pommier adulte au fil des saisons (ce que veut voir la personne : son jardin fleuri même en hiver)', () => {
  it('hiver : sans feuilles ; printemps : en fleurs ; été : en feuilles ; automne : fruits ou couleurs', () => {
    expect(phaseOf(state('pommier', 'hiver'))).toBe('nu')
    expect(phaseOf(state('pommier', 'printemps'))).toBe('fleurs')
    expect(['feuilles', 'fruits']).toContain(phaseOf(state('pommier', 'ete')))
    expect(['fruits', 'automne']).toContain(phaseOf(state('pommier', 'automne')))
  })
  it('la taille reste celle d’aujourd’hui : seule la saison change', () => {
    const today = state('pommier', 'aujourdhui')
    for (const s of ['hiver', 'printemps', 'ete', 'automne'] as const) {
      expect(state('pommier', s).heightM).toBeCloseTo(today.heightM, 5)
      expect(state('pommier', s).spreadM).toBeCloseTo(today.spreadM, 5)
    }
  })
  it('un persistant (romarin, thuya) garde ses feuilles l’hiver', () => {
    expect(phaseOf(state('romarin', 'hiver'))).not.toBe('nu')
  })
})

describe('canopyLook : couleur et opacité sur la carte', () => {
  const sp = SPECIES_BY_ID.pommier
  it('hiver : bois nu, très transparent ; été : vert de l’espèce', () => {
    const winter = canopyLook(state('pommier', 'hiver'), sp)
    expect(winter.opacity).toBeLessThan(0.3)
    expect(winter.color).not.toBe(sp.couleur)
    const summer = canopyLook(state('pommier', 'ete'), sp)
    expect(summer.opacity).toBeGreaterThanOrEqual(0.4)
  })
  it('printemps : la couleur de fleur se mêle au vert', () => {
    const spring = canopyLook(state('pommier', 'printemps'), sp)
    expect(spring.color).not.toBe(sp.couleur)
    expect(/^#[0-9a-f]{6}$/.test(spring.color)).toBe(true)
  })
  it('une plante morte est grise et presque invisible ; espèce inconnue : vert par défaut, sans erreur', () => {
    const dead = canopyLook({ ...state('pommier', 'ete'), dead: true }, sp)
    expect(dead.opacity).toBeLessThanOrEqual(0.25)
    expect(canopyLook(state('pommier', 'ete'), undefined).color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('mixHex', () => {
  it('mélange, bornes et couleurs invalides', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#102030', '#ffffff', 0)).toBe('#102030')
    expect(mixHex('#102030', '#ffffff', 5)).toBe('#ffffff')
    expect(mixHex('pas une couleur', '#ffffff', 0)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('seasonSummary', () => {
  const by = SPECIES_BY_ID
  it('une phrase courte avec les nombres de plantes par état', () => {
    const plants = [plant('pommier'), plant('poirier'), plant('romarin')]
    const winter = seasonSummary(plants, by, 'hiver', NOW)
    expect(winter).toMatch(/^En hiver : /)
    expect(winter).toMatch(/2 sans feuilles/)
    expect(seasonSummary(plants, by, 'printemps', NOW)).toMatch(/^Au printemps : .*en fleurs/)
    for (const c of ['aujourdhui', 'hiver', 'printemps', 'ete', 'automne'] as const) expect(seasonSummary(plants, by, c, NOW).split(/\s+/).length).toBeLessThanOrEqual(20)
  })
  it('sans plante en place : une phrase claire ; les projets et plantes mortes ne comptent pas', () => {
    expect(seasonSummary([], by, 'ete', NOW)).toBe('En été : aucune plante en place.')
    expect(seasonSummary([plant('pommier', { status: 'projet' }), plant('poirier', { status: 'mort' })], by, 'ete', NOW)).toBe('En été : aucune plante en place.')
  })
})
