import { describe, expect, it } from 'vitest'
import { SPECIES_BY_ID } from '../data/species'
import type { Plant } from '../types'
import { canopyLook, journalSeasonNote, mixHex, phaseOf, photoDate, photoSeasonPhrase, plantLabelAtSeason, seasonDate, seasonOfMonth, seasonOfPhoto, seasonSummary, SEASONS, SEASON_CHOICES, stateAtSeason } from './season'

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
  it('une plante récoltée ne compte plus comme vivante', () => {
    expect(seasonSummary([plant('tomate', { status: 'recoltee' })], by, 'ete', NOW)).toBe('En été : aucune plante en place.')
  })
})

describe('saison d’une photo (hémisphère nord)', () => {
  it('mois -> saison : déc.-fév. hiver, mars-mai printemps, juin-août été, sept.-nov. automne', () => {
    const got = Array.from({ length: 12 }, (_, i) => seasonOfMonth(i + 1))
    expect(got).toEqual(['hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'ete', 'ete', 'ete', 'automne', 'automne', 'automne', 'hiver'])
    expect(seasonOfMonth(0)).toBeUndefined()
    expect(seasonOfMonth(13)).toBeUndefined()
    expect(seasonOfMonth(2.5)).toBeUndefined()
  })
  it('date de photo : un jour ou une date ISO ; faux, ancien ou futur = pas de date', () => {
    expect(photoDate('2026-06-12', NOW)?.getMonth()).toBe(5)
    expect(photoDate('2026-06-12T08:30:00.000Z', NOW)?.getFullYear()).toBe(2026)
    for (const bad of [undefined, '', 'pas une date', '2026-02-30', '1969-07-20', '2031-01-01', '2026-13-01']) expect(photoDate(bad, NOW), String(bad)).toBeUndefined()
    expect(seasonOfPhoto('2025-12-01', NOW)).toBe('hiver')
    expect(seasonOfPhoto('2026-02-28', NOW)).toBe('hiver')
    expect(seasonOfPhoto('2026-03-01', NOW)).toBe('printemps')
    expect(seasonOfPhoto('2026-08-31', NOW)).toBe('ete')
    expect(seasonOfPhoto('2026-09-01', NOW)).toBe('automne')
  })
  it('un jour « AAAA-MM-JJ » ne glisse pas à la veille (lu en heure locale)', () => {
    expect(photoDate('2026-06-01', NOW)?.getDate()).toBe(1)
    expect(seasonOfPhoto('2026-06-01', NOW)).toBe('ete')
    expect(seasonOfPhoto('2026-05-31', NOW)).toBe('printemps')
  })
  it('la phrase de la visionneuse', () => {
    expect(photoSeasonPhrase('2026-06-12', NOW)).toBe('Photo prise le 12 juin 2026 (été) : les plantes sont décrites à cette date.')
    expect(photoSeasonPhrase('2026-01-01', NOW)).toBe('Photo prise le 1er janvier 2026 (hiver) : les plantes sont décrites à cette date.')
    expect(photoSeasonPhrase('n’importe quoi', NOW)).toBeUndefined()
    expect(photoSeasonPhrase('2026-06-12', NOW)!.split(/\s+/).length).toBeLessThanOrEqual(20)
  })
  it('état en mots à la saison de la photo : pommier en fleurs au printemps, sans feuilles en hiver ; rien pour un projet ou une plante morte', () => {
    const pom = plant('pommier')
    const sp = SPECIES_BY_ID.pommier
    expect(plantLabelAtSeason(pom, sp, NOW, 'printemps')).toBe('en fleurs')
    expect(plantLabelAtSeason(pom, sp, NOW, 'hiver')).toBe('sans feuilles')
    expect(plantLabelAtSeason(plant('pommier', { status: 'projet' }), sp, NOW, 'ete')).toBeUndefined()
    expect(plantLabelAtSeason(plant('pommier', { status: 'mort' }), sp, NOW, 'ete')).toBeUndefined()
    expect(plantLabelAtSeason(plant('tomate', { status: 'recoltee' }), SPECIES_BY_ID.tomate, NOW, 'ete')).toBe('récoltée')
    expect(plantLabelAtSeason(pom, undefined, NOW, 'ete')).toBeUndefined()
    // une annuelle semée en août 2026 n'existe pas encore au « cœur de l'été » (10 juillet 2026) : aucune mention, jamais « sans feuilles »
    const tom = plant('tomate', { plantedAt: '2026-08-05' })
    expect(plantLabelAtSeason(tom, SPECIES_BY_ID.tomate, NOW, 'ete')).toBeUndefined()
    expect(plantLabelAtSeason({ ...tom, plantedAt: '2026-05-05' }, SPECIES_BY_ID.tomate, NOW, 'ete')).toBeDefined()
    // même résultat que de choisir la saison à la main
    expect(plantLabelAtSeason(pom, sp, NOW, 'ete')).toBe(PHASE_LABEL_OF(pom, 'ete'))
  })
  it('mention du journal : saison + état d’ordinaire ; rien sans date', () => {
    const pom = plant('pommier')
    const sp = SPECIES_BY_ID.pommier
    expect(journalSeasonNote('2026-04-20', pom, sp, NOW)).toBe('Au printemps : en fleurs d’ordinaire.')
    expect(journalSeasonNote('2026-01-10', pom, sp, NOW)).toBe('En hiver : sans feuilles d’ordinaire.')
    expect(journalSeasonNote('2026-04-20', pom, undefined, NOW)).toBe('Photo prise au printemps.')
    expect(journalSeasonNote('2026-04-20', plant('tomate', { status: 'recoltee' }), SPECIES_BY_ID.tomate, NOW)).toBe('Photo prise au printemps.')
    expect(journalSeasonNote(undefined, pom, sp, NOW)).toBeUndefined()
    expect(journalSeasonNote('2026-02-30', pom, sp, NOW)).toBeUndefined()
  })
})

const PHASE_LABEL_OF = (p: Plant, season: 'ete') => ({ fleurs: 'en fleurs', fruits: 'avec ses fruits', automne: 'aux couleurs d’automne', nu: 'sans feuilles', bourgeons: 'aux premières feuilles', feuilles: 'en feuilles', morte: 'morte' })[phaseOf(stateAtSeason(p, SPECIES_BY_ID[p.speciesId], NOW, seasonDate(season, NOW)))]
