import { describe, expect, it, vi } from 'vitest'
import { toLonLat } from '../../lib/geo'

const CENTER = { lon: 4.83, lat: 45.76 }
const ring = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }].map((p) => toLonLat(CENTER, p))

const buildings = vi.fn(async () => [
  { id: 'inconnu', ring, heightM: 6, heightKnown: false },
  { id: 'connu', ring, heightM: 9, heightKnown: true },
])
vi.mock('../../lib/ign', () => ({
  fetchParcel: vi.fn(async () => null),
  fetchBuildings: () => buildings(),
  fetchTerrain: vi.fn(async () => {
    throw new Error('hors ligne')
  }),
}))
vi.mock('../../lib/weather', () => ({ fetchClimate: vi.fn(async () => { throw new Error('hors ligne') }) }))

// Grille 1 m par pixel : toit à 8 m sur [0,20]×[0,20].
const n = 61
const canopy = {
  size: (n - 1) / 2,
  n,
  heights: Array.from({ length: n * n }, (_, k) => {
    const x = -30 + (k % n)
    const y = -30 + Math.floor(k / n)
    return x >= 0 && x <= 20 && y >= 0 && y <= 20 ? 8 : 0
  }),
}
const fetchLidar = vi.fn()
vi.mock('../../lib/lidar', async (orig) => ({ ...(await orig<typeof import('../../lib/lidar')>()), fetchLidar: (...a: unknown[]) => fetchLidar(...a) }))

import { buildGarden } from './createGarden'
import { setLidarEnabled } from '../../lib/useLidar'

const place = { label: '1 rue Test', ...CENTER }

describe('buildGarden : hauteur des bâtiments sans donnée', () => {
  it('MNH LiDAR disponible : la hauteur mesurée remplace les 6 m, la hauteur connue ne bouge pas', async () => {
    setLidarEnabled(true)
    fetchLidar.mockResolvedValueOnce({ canopy, trees: [] })
    const g = await buildGarden(place, 'T', () => {})
    const byId = Object.fromEntries((g.buildings ?? []).map((b) => [b.id, b]))
    expect(byId.inconnu.heightM).toBeCloseTo(8, 0)
    expect(byId.connu.heightM).toBe(9)
    expect(Object.keys(byId.inconnu).sort()).toEqual(['heightM', 'id', 'ring']) // format stocké inchangé
  })
  it('LiDAR indisponible : repli silencieux sur 6 m', async () => {
    setLidarEnabled(true)
    fetchLidar.mockResolvedValueOnce(null)
    const g = await buildGarden(place, 'T', () => {})
    expect(g.buildings?.find((b) => b.id === 'inconnu')?.heightM).toBe(6)
    fetchLidar.mockRejectedValueOnce(new Error('Connexion impossible'))
    const g2 = await buildGarden(place, 'T', () => {})
    expect(g2.buildings?.find((b) => b.id === 'inconnu')?.heightM).toBe(6)
  })
  it('réglage « arbres des environs » coupé : aucune requête LiDAR', async () => {
    setLidarEnabled(false)
    fetchLidar.mockClear()
    const g = await buildGarden(place, 'T', () => {})
    expect(fetchLidar).not.toHaveBeenCalled()
    expect(g.buildings?.find((b) => b.id === 'inconnu')?.heightM).toBe(6)
    setLidarEnabled(true)
  })
})
