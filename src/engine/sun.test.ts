import { describe, expect, it } from 'vitest'
import type { Garden, Plant, Species, XY } from '../types'
import {
  isShaded,
  obstaclesFor,
  seasonalSunHours,
  sunDirection,
  sunHoursAt,
  sunHoursGrid,
  treeObstacles,
  type Obstacle,
} from './sun'

const PARIS = { lat: 48.8566, lon: 2.3522 }

const garden = (extra: Partial<Garden> = {}): Garden => ({
  id: 'g1',
  name: 'Test',
  address: 'Paris',
  center: PARIS,
  createdAt: '2026-01-01',
  ...extra,
})

const rect = (x0: number, y0: number, x1: number, y1: number): XY[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

const species = (id: string, hauteurAdulteM: number, envergureAdulteM: number, vivace = true): Species => ({
  id,
  nomCommun: id,
  nomLatin: id,
  famille: 'Test',
  categorie: vivace ? 'arbre' : 'legume',
  strate: vivace ? 'arbre-bas' : 'herbacee',
  vivace,
  comestible: true,
  soleil: ['plein-soleil'],
  eau: 'moyen',
  rusticiteC: -20,
  hauteurAdulteM,
  envergureAdulteM,
  anneesMaturite: vivace ? 10 : 1,
  espacementCm: 100,
  compagnons: [],
  antagonistes: [],
  taches: [],
  entretien: '',
  couleur: '#3a7',
})

describe('sunDirection', () => {
  it('à midi solaire le 21 juin à Paris, le soleil est plein sud à ~65°', () => {
    const s = sunDirection(new Date(Date.UTC(2026, 5, 21, 11, 51)), PARIS.lat, PARIS.lon)
    expect(s.altitude).toBeGreaterThan(63.5)
    expect(s.altitude).toBeLessThan(65.5)
    expect(Math.abs(s.azimuth - 180)).toBeLessThan(3)
    expect(s.vector.y).toBeLessThan(-0.4) // vers le sud
    expect(Math.abs(s.vector.x)).toBeLessThan(0.03)
    expect(Math.hypot(s.vector.x, s.vector.y, s.vector.z)).toBeCloseTo(1, 6)
  })

  it('le matin le soleil est à l’est, le soir à l’ouest', () => {
    const matin = sunDirection(new Date(Date.UTC(2026, 2, 21, 7)), PARIS.lat, PARIS.lon)
    const soir = sunDirection(new Date(Date.UTC(2026, 2, 21, 16)), PARIS.lat, PARIS.lon)
    expect(matin.vector.x).toBeGreaterThan(0.5)
    expect(matin.azimuth).toBeGreaterThan(80)
    expect(matin.azimuth).toBeLessThan(130)
    expect(soir.vector.x).toBeLessThan(-0.5)
    expect(soir.azimuth).toBeGreaterThan(220)
  })
})

describe('isShaded', () => {
  const building: Obstacle[] = [{ kind: 'prism', ring: rect(-5, -5, 5, 5), heightM: 10 }]
  const decNoon = sunDirection(new Date(Date.UTC(2026, 11, 21, 11, 50)), PARIS.lat, PARIS.lon).vector
  const juneNoon = sunDirection(new Date(Date.UTC(2026, 5, 21, 11, 51)), PARIS.lat, PARIS.lon).vector

  it('un point au nord d’un bâtiment de 10 m est à l’ombre en décembre', () => {
    expect(isShaded({ x: 0, y: 8 }, decNoon, building)).toBe(true)
    expect(isShaded({ x: 0, y: 30 }, decNoon, building)).toBe(true) // ombre de ~31 m
    expect(isShaded({ x: 0, y: 40 }, decNoon, building)).toBe(false)
    expect(isShaded({ x: 0, y: -8 }, decNoon, building)).toBe(false) // côté sud
  })

  it('en juin à midi, l’ombre portée est courte', () => {
    expect(isShaded({ x: 0, y: 8 }, juneNoon, building)).toBe(true) // 3 m < ~4,8 m
    expect(isShaded({ x: 0, y: 11 }, juneNoon, building)).toBe(false)
  })

  it('un point en hauteur au-dessus du toit est au soleil', () => {
    expect(isShaded({ x: 0, y: 8, z: 12 }, decNoon, building)).toBe(false)
  })

  it('soleil sous l’horizon = ombre', () => {
    expect(isShaded({ x: 0, y: 0 }, { x: 0, y: -1, z: -0.1 }, [])).toBe(true)
  })

  it('couronne d’arbre : ombre juste au nord, pas plus loin', () => {
    const tree: Obstacle[] = [{ kind: 'crown', center: { x: 0, y: 0 }, baseM: 2, topM: 6, radiusM: 2 }]
    expect(isShaded({ x: 0, y: 2.5 }, juneNoon, tree)).toBe(true)
    expect(isShaded({ x: 0, y: 6 }, juneNoon, tree)).toBe(false)
    expect(isShaded({ x: 0, y: -3 }, juneNoon, tree)).toBe(false)
  })
})

describe('obstaclesFor', () => {
  it('garde les bâtiments et les plantes de plus de 1,5 m', () => {
    const g = garden({ buildings: [{ id: 'b', ring: rect(0, 0, 4, 4), heightM: 6 }] })
    const speciesById = { chene: species('chene', 15, 10), tomate: species('tomate', 1.2, 0.6, false) }
    const plants: Plant[] = [
      { id: 'p1', gardenId: 'g1', speciesId: 'chene', position: { x: 10, y: 0 }, plantedAt: '2000-01-01', status: 'en-place', photos: [] },
      { id: 'p2', gardenId: 'g1', speciesId: 'tomate', position: { x: 5, y: 5 }, plantedAt: '2026-04-01', status: 'en-place', photos: [] },
      { id: 'p3', gardenId: 'g1', speciesId: 'chene', position: { x: 20, y: 0 }, plantedAt: '2000-01-01', status: 'projet', photos: [] },
    ]
    const obs = obstaclesFor(g, plants, speciesById, new Date(2026, 6, 1))
    expect(obs).toHaveLength(2)
    expect(obs[0].kind).toBe('prism')
    const crown = obs[1]
    expect(crown.kind).toBe('crown')
    if (crown.kind === 'crown') {
      expect(crown.topM).toBeCloseTo(15, 0)
      expect(crown.baseM).toBeCloseTo(crown.topM * 0.35, 6)
      expect(crown.radiusM).toBeCloseTo(5, 0)
    }
  })
})

describe('arbres voisins (LiDAR)', () => {
  it('ajoute des couronnes et ignore les entrées invalides', () => {
    const obs = treeObstacles([
      { x: 0, y: 5, heightM: 12, radiusM: 4 },
      { x: 0, y: 5, heightM: 1, radiusM: 4 },
      { x: NaN, y: 5, heightM: 12, radiusM: 4 },
    ])
    expect(obs).toHaveLength(1)
    expect(obs[0]).toMatchObject({ kind: 'crown', topM: 12, radiusM: 4 })
  })

  it('obstaclesFor les inclut en dernier ; sans eux rien ne change', () => {
    const g = garden()
    expect(obstaclesFor(g, [], {}, new Date(2026, 6, 1))).toHaveLength(0)
    const obs = obstaclesFor(g, [], {}, new Date(2026, 6, 1), [{ x: 0, y: 5, heightM: 12, radiusM: 4 }])
    expect(obs).toHaveLength(1)
  })

  it('un grand arbre au nord ombrage le point à midi d’hiver sans gêner l’ensoleillement d’été au sud', () => {
    const g = garden()
    const at = new Date(2026, 11, 21, 12)
    const free = sunHoursAt({ x: 0, y: 0 }, g, [], at)
    const south = treeObstacles([{ x: 0, y: -25, heightM: 15, radiusM: 5 }])
    const north = treeObstacles([{ x: 0, y: 25, heightM: 15, radiusM: 5 }])
    expect(sunHoursAt({ x: 0, y: 0 }, g, south, at)).toBeLessThan(free - 0.3)
    expect(sunHoursAt({ x: 0, y: 0 }, g, north, at)).toBeCloseTo(free, 1)
  })
})

describe('heures d’ensoleillement', () => {
  const g = garden()
  const building: Obstacle[] = [{ kind: 'prism', ring: rect(-5, -5, 5, 5), heightM: 10 }]

  it('terrain dégagé : ~15 h en juin, ~8 h en décembre', () => {
    const juin = sunHoursAt({ x: 0, y: 0 }, g, [], new Date(2026, 5, 21, 12))
    const dec = sunHoursAt({ x: 0, y: 0 }, g, [], new Date(2026, 11, 21, 12))
    expect(juin).toBeGreaterThan(14.5)
    expect(juin).toBeLessThan(16.5)
    expect(dec).toBeGreaterThan(6.5)
    expect(dec).toBeLessThan(8.5)
  })

  it('au nord du bâtiment de 10 m : quasiment pas de soleil en décembre', () => {
    expect(sunHoursAt({ x: 0, y: 8 }, g, building, new Date(2026, 11, 21, 12))).toBeLessThan(1)
    expect(sunHoursAt({ x: 0, y: -8 }, g, building, new Date(2026, 11, 21, 12))).toBeGreaterThan(6)
  })

  it('seasonalSunHours : juin > mars > décembre', () => {
    const s = seasonalSunHours({ x: 0, y: 8 }, g, building, 2026)
    expect(s.juin).toBeGreaterThan(s.mars)
    expect(s.mars).toBeGreaterThan(s.decembre)
    expect(s.moyenne).toBeCloseTo((2 * s.mars + s.juin + s.decembre) / 4, 1)
  })

  it('sunHoursGrid : ordre sud→nord puis ouest→est', () => {
    // Mur bas au sud de la grille : il ombre la rangée sud en décembre, pas la rangée nord.
    const wall: Obstacle[] = [{ kind: 'prism', ring: rect(-40, -14, 40, -12), heightM: 4 }]
    const grid = sunHoursGrid(g, wall, new Date(2026, 11, 21, 12), { halfSizeM: 10, n: 3 })
    expect(grid.values).toHaveLength(9)
    const sud = grid.values.slice(0, 3)
    const nord = grid.values.slice(6, 9)
    for (let i = 0; i < 3; i++) expect(sud[i]).toBeLessThan(nord[i])
    // Bâtiment à l'est de la grille : la colonne est perd le soleil du matin.
    const east: Obstacle[] = [{ kind: 'prism', ring: rect(12, -30, 14, 30), heightM: 8 }]
    const g2 = sunHoursGrid(g, east, new Date(2026, 5, 21, 12), { halfSizeM: 10, n: 3 })
    expect(g2.values[2]).toBeLessThan(g2.values[0])
  })

  it('performance : grille 40×40 avec 100 bâtiments en < 1,5 s', () => {
    let seed = 42
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const obs: Obstacle[] = Array.from({ length: 100 }, () => {
      const x = rnd() * 160 - 80
      const y = rnd() * 160 - 80
      const w = 4 + rnd() * 10
      return { kind: 'prism' as const, ring: rect(x, y, x + w, y + 4 + rnd() * 10), heightM: 3 + rnd() * 12 }
    })
    const t0 = performance.now()
    const grid = sunHoursGrid(g, obs, new Date(2026, 5, 21, 12), { halfSizeM: 50, n: 40 })
    const ms = performance.now() - t0
    console.log(`sunHoursGrid 40×40, 100 bâtiments, 21 juin : ${ms.toFixed(0)} ms`)
    expect(grid.values).toHaveLength(1600)
    expect(ms).toBeLessThan(1500)
  })
})
