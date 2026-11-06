import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Garden, Panorama } from '../../types'

const photos = vi.hoisted(() => ({ getPhoto: vi.fn(async (id: string): Promise<Blob | undefined> => (id === 'photo:a' ? new Blob(['x'.repeat(100)]) : id === 'photo:b' ? new Blob(['y'.repeat(50)]) : undefined)), deletePhoto: vi.fn(async () => undefined) }))
vi.mock('../../lib/photos', () => photos)
const store = vi.hoisted(() => ({ gardens: [] as unknown[], updateGarden: vi.fn() }))
vi.mock('../../lib/store', () => ({
  getState: () => ({ gardens: store.gardens }),
  updateGarden: (id: string, patch: { panoramas?: unknown }) => {
    store.updateGarden(id, patch)
    store.gardens = (store.gardens as Garden[]).map((g) => (g.id === id ? { ...g, ...patch } : g))
  },
}))

import { noteBytes, pointBytes, usedBytes } from './panoData'

const point = (id: string, extra: Partial<Panorama> = {}): Panorama => ({ id, x: 0, y: 0, takenAt: '2026-05-01T10:00:00.000Z', kind: 'guide', shots: [{ photoId: 'photo:a', headingDeg: 0, fovDeg: 60 }, { photoId: 'photo:b', headingDeg: 90, fovDeg: 60 }], ...extra })

beforeEach(() => {
  photos.getPhoto.mockClear()
  store.updateGarden.mockClear()
  store.gardens = [{ id: 'g1', name: 'J', center: { lon: 2, lat: 48 }, createdAt: '2026-01-01T00:00:00.000Z', panoramas: [point('p1'), point('p2', { bytes: 999 })] }]
})

describe('poids d’un point de vue', () => {
  it('sans poids noté : lit les photos et additionne', async () => {
    expect(await pointBytes(point('x'))).toBe(150)
    expect(photos.getPhoto).toHaveBeenCalledTimes(2)
  })
  it('avec un poids noté : aucune photo relue', async () => {
    expect(await pointBytes(point('x', { bytes: 1234 }))).toBe(1234)
    expect(photos.getPhoto).not.toHaveBeenCalled()
  })
  it('usedBytes mêle les deux', async () => {
    expect(await usedBytes([point('p1'), point('p2', { bytes: 999 })])).toBe(150 + 999)
    expect(photos.getPhoto).toHaveBeenCalledTimes(2)
  })
})

describe('noteBytes', () => {
  it('note le poids d’un point ancien, une seule fois', () => {
    noteBytes('g1', 'p1', 150)
    expect(store.updateGarden).toHaveBeenCalledTimes(1)
    const g = (store.gardens as Garden[])[0]
    expect(g.panoramas?.find((p) => p.id === 'p1')?.bytes).toBe(150)
    noteBytes('g1', 'p1', 777) // déjà noté : ne change rien
    expect(store.updateGarden).toHaveBeenCalledTimes(1)
    expect((store.gardens as Garden[])[0].panoramas?.find((p) => p.id === 'p1')?.bytes).toBe(150)
  })
  it('ne touche pas un point qui a déjà un poids, ni un poids nul ou un point inconnu', () => {
    noteBytes('g1', 'p2', 5)
    noteBytes('g1', 'p1', 0)
    noteBytes('g1', 'absent', 10)
    expect(store.updateGarden).not.toHaveBeenCalled()
  })
})
