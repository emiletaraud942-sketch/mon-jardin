import { describe, expect, it, vi } from 'vitest'
import type { Garden, TerrainGrid } from '../types'
import { obstaclesFor, seasonalSunHours } from '../engine/sun'
import { filterTrees, type LidarData } from './lidar'
import { chooseTerrain, isValidTerrain } from './terrain'
import { createLidarStore, lidarMessage, parseLidarPref } from './useLidar'

const CENTER = { lat: 48.8566, lon: 2.3522 }
const garden: Garden = { id: 'g1', name: 'T', address: '', center: CENTER, createdAt: '2026-01-01' }
const flat = (size: number, n: number, fn: (i: number, j: number) => number = () => 0): TerrainGrid => ({
  size,
  n,
  heights: Array.from({ length: n * n }, (_, k) => fn(k % n, Math.floor(k / n))),
})
const data = (extra: Partial<LidarData> = {}): LidarData => ({
  canopy: flat(60, 4),
  trees: [
    { x: 0, y: -20, heightM: 14, radiusM: 5 },
    { x: 30, y: 30, heightM: 9, radiusM: 3 },
  ],
  ...extra,
})

describe('réglage', () => {
  it('activé par défaut, seul « 0 » désactive', () => {
    expect(parseLidarPref(null)).toBe(true)
    expect(parseLidarPref(undefined)).toBe(true)
    expect(parseLidarPref('1')).toBe(true)
    expect(parseLidarPref('0')).toBe(false)
  })
})

describe('mémoire des chargements', () => {
  it('un seul appel réseau par jardin, même demandé deux fois en même temps', async () => {
    const fetcher = vi.fn(async () => data())
    const store = createLidarStore(fetcher)
    const [a, b] = await Promise.all([store.load(CENTER), store.load(CENTER)])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(a.status).toBe('ok')
    expect(b).toBe(a)
    await store.load(CENTER)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('passe par loading puis ok ; actualiser force un nouvel appel qui ignore le cache', async () => {
    const fetcher = vi.fn(async (_c: unknown, _o?: { force?: boolean }) => data())
    const store = createLidarStore(fetcher as never)
    const seen: string[] = []
    store.subscribe(() => seen.push(store.get(store.keyOf(CENTER)).status))
    await store.load(CENTER)
    expect(seen).toEqual(['loading', 'ok'])
    await store.load(CENTER, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1][1]?.force).toBe(true)
  })

  it('service indisponible (null) : unavailable, sans nouvel essai automatique', async () => {
    const fetcher = vi.fn(async (_c: unknown, o?: { onWarning?: (m: string, d?: string) => void }) => {
      o?.onWarning?.('Le relief détaillé n’a pas pu être chargé.', 'LiDAR IGN a répondu une erreur (404).')
      return null
    })
    const store = createLidarStore(fetcher as never)
    const s = await store.load(CENTER)
    expect(s).toMatchObject({ status: 'unavailable', data: null, detail: 'LiDAR IGN a répondu une erreur (404).' })
    await store.load(CENTER)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await store.load(CENTER, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('une exception du chargeur ne remonte jamais', async () => {
    const store = createLidarStore((async () => {
      throw new Error('boom')
    }) as never)
    await expect(store.load(CENTER)).resolves.toMatchObject({ status: 'unavailable' })
  })

  it('jardins différents : appels séparés', async () => {
    const fetcher = vi.fn(async () => data())
    const store = createLidarStore(fetcher)
    await store.load(CENTER)
    await store.load({ lat: 45, lon: 3 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('messages', () => {
  it('langage simple', () => {
    expect(lidarMessage({ status: 'ok' }, 12)).toBe('12 arbres trouvés autour de votre terrain.')
    expect(lidarMessage({ status: 'ok' }, 1)).toBe('1 arbre trouvé autour de votre terrain.')
    expect(lidarMessage({ status: 'ok' }, 0)).toBe('Aucun arbre trouvé autour de votre terrain.')
    expect(lidarMessage({ status: 'unavailable' }, 0)).toBe('Données indisponibles ici, on garde le relief habituel.')
    expect(lidarMessage({ status: 'idle' }, 0)).toBe('')
  })
})

describe('choix du relief', () => {
  const rge = flat(40, 21, (i) => i * 0.1) // pas de 4 m
  const fine = flat(60, 121, (i) => i * 0.02) // pas de 1 m

  it('valide les grilles', () => {
    expect(isValidTerrain(fine)).toBe(true)
    expect(isValidTerrain({ ...fine, heights: fine.heights.slice(1) })).toBe(false)
    expect(isValidTerrain(flat(10, 3, () => NaN))).toBe(false)
    expect(isValidTerrain(flat(10, 3, (i) => (i === 0 ? 900 : 0)))).toBe(false)
    expect(isValidTerrain(undefined)).toBe(false)
  })

  it('prend le LiDAR s’il est plus fin et couvre l’existant, sans toucher à l’existant', () => {
    const copy = JSON.stringify(rge)
    const r = chooseTerrain(rge, fine)
    expect(r.source).toBe('lidar')
    expect(r.grid).toBe(fine)
    expect(JSON.stringify(rge)).toBe(copy)
  })

  it('garde RGE ALTI si le LiDAR est absent, invalide, moins fin ou plus étroit', () => {
    expect(chooseTerrain(rge, undefined)).toEqual({ grid: rge, source: 'rge' })
    expect(chooseTerrain(rge, flat(60, 121, () => NaN)).source).toBe('rge')
    expect(chooseTerrain(rge, flat(60, 25)).source).toBe('rge') // pas de 2,5 m : pas assez plus fin
    expect(chooseTerrain(rge, flat(20, 61)).source).toBe('rge') // ne couvre pas 40 m
  })

  it('sans relief existant, un LiDAR valide sert ; sinon rien', () => {
    expect(chooseTerrain(undefined, fine).source).toBe('lidar')
    expect(chooseTerrain(undefined, undefined)).toEqual({ grid: undefined, source: 'none' })
  })
})

describe('ombres avec arbres des environs', () => {
  const at = new Date(2026, 11, 21, 12)

  it('un grand arbre au sud réduit le soleil d’hiver ; sans arbre le résultat est identique à avant', () => {
    const spot = { x: 0, y: 0 }
    const trees = filterTrees(data().trees, {})
    const before = seasonalSunHours(spot, garden, obstaclesFor(garden, [], {}, at))
    const same = seasonalSunHours(spot, garden, obstaclesFor(garden, [], {}, at, []))
    const withTrees = seasonalSunHours(spot, garden, obstaclesFor(garden, [], {}, at, trees))
    expect(same).toEqual(before)
    expect(withTrees.decembre).toBeLessThan(before.decembre - 0.3)
  })

  it('filterTrees écarte un arbre dans un bâtiment connu ou sur une plante du jardin', () => {
    const ring = [
      { x: -3, y: -23 },
      { x: 3, y: -23 },
      { x: 3, y: -17 },
      { x: -3, y: -17 },
    ]
    expect(filterTrees(data().trees, { buildingRings: [ring] })).toHaveLength(1)
    expect(filterTrees(data().trees, { plantPositions: [{ x: 30.5, y: 30 }] })).toHaveLength(1)
  })
})
