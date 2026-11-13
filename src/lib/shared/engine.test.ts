import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Garden, Plant } from '../../types'
import type { PushRow, RemoteRow } from './model'
import { plantHash, remotePlantData } from './model'

// La synchro à plusieurs avec un faux serveur en mémoire et un faux magasin : reprendre d'abord, envoyer ensuite, conflits, départ.

const GID = '11111111-1111-4111-8111-111111111111'
const mem = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }

const store = vi.hoisted(() => ({ gardens: [] as unknown[], plants: [] as unknown[] }))
vi.mock('../store', () => ({
  getState: () => store,
  subscribeStore: () => () => undefined,
  updateGarden: (id: string, patch: Record<string, unknown>) => {
    store.gardens = (store.gardens as { id: string }[]).map((g) => (g.id === id ? { ...g, ...patch } : g))
  },
  applySharedPlants: (gid: string, plants: unknown[]) => {
    store.plants = [...(store.plants as { gardenId: string }[]).filter((p) => p.gardenId !== gid), ...plants]
  },
  addGarden: (g: unknown) => void (store.gardens = [...store.gardens, g]),
}))
vi.mock('../sync', () => ({ currentUser: async () => ({ id: 'u1' }) }))
const toasts: string[] = []
vi.mock('../toast', () => ({ showToast: (t: { message: string }) => void toasts.push(t.message) }))

// Faux serveur.
const server = vi.hoisted(() => ({ member: true, rows: new Map<string, { data: Record<string, unknown>; deleted: boolean; updated_at: string }>(), clock: 0, garden: { name: 'Bruyères', garden: { name: 'Bruyères', center: { lon: 1, lat: 49 } } as Record<string, unknown>, updated_at: 'G1' }, gardenPushes: 0, pulls: [] as (string | undefined)[] }))
vi.mock('./api', () => {
  class SharedError extends Error {}
  const stamp = () => `2026-11-13T10:00:${String(++server.clock).padStart(2, '0')}.5+00:00`
  return {
    SharedError,
    fetchGarden: async () => (server.member ? server.garden : null),
    fetchMyRole: async () => 'admin',
    pullPlants: async (_g: string, since?: string): Promise<RemoteRow[]> => {
      server.pulls.push(since)
      return [...server.rows.entries()].filter(([, r]) => !since || r.updated_at >= since).map(([id, r]) => ({ id, ...r }))
    },
    pushPlants: async (_g: string, rows: PushRow[]) => {
      const ok: { id: string; updated_at: string }[] = []
      const conflicts: string[] = []
      for (const r of rows) {
        const cur = server.rows.get(r.id)
        if ((r.base === undefined && cur) || (r.base !== undefined && cur?.updated_at !== r.base)) {
          conflicts.push(r.id)
          continue
        }
        const at = stamp()
        server.rows.set(r.id, { data: r.data, deleted: r.deleted, updated_at: at })
        ok.push({ id: r.id, updated_at: at })
      }
      return { ok, conflicts }
    },
    pushGarden: async () => {
      server.gardenPushes++
      server.garden = { ...server.garden, updated_at: stamp() }
      return server.garden.updated_at
    },
  }
})

const { syncSharedGarden, readSyncState, detachGarden, importSharedGarden } = await import('./engine')

const garden = (over: Partial<Garden> = {}): Garden => ({ id: 'local', name: 'Bruyères', address: '', center: { lon: 1, lat: 49 }, createdAt: '2026-01-01T00:00:00.000Z', shared: { id: GID, role: 'admin' }, ...over })
const plant = (id: string, over: Partial<Plant> = {}): Plant => ({ id, gardenId: 'local', speciesId: 'pommier', position: { x: 1, y: 2 }, plantedAt: '2026-03-01', status: 'en-place', photos: [], ...over })

beforeEach(() => {
  mem.clear()
  toasts.length = 0
  server.member = true
  server.rows.clear()
  server.clock = 0
  server.gardenPushes = 0
  server.pulls = []
  server.garden = { name: 'Bruyères', garden: { name: 'Bruyères', center: { lon: 1, lat: 49 } }, updated_at: 'G1' }
  store.gardens = [garden()]
  store.plants = []
})

describe('synchro d’un jardin partagé', () => {
  it('envoie les plantes d’ici, puis ne renvoie plus rien', async () => {
    store.plants = [plant('a'), plant('b', { notes: 'x' })]
    const r = await syncSharedGarden(garden())
    expect(r).toMatchObject({ kind: 'ok', pushed: 2 })
    expect([...server.rows.keys()].sort()).toEqual(['a', 'b'])
    const again = await syncSharedGarden(garden())
    expect(again).toMatchObject({ kind: 'ok', pushed: 0 })
  })

  it('reprend les plantes des autres, sans renvoyer ce qu’on vient de recevoir', async () => {
    server.rows.set('z', { data: remotePlantData(plant('z', { notes: 'de Léa' })), deleted: false, updated_at: '2026-11-13T09:00:00.5+00:00' })
    const r = await syncSharedGarden(garden())
    expect(r).toMatchObject({ kind: 'ok', pushed: 0 })
    expect((store.plants as Plant[]).find((p) => p.id === 'z')).toMatchObject({ notes: 'de Léa', gardenId: 'local' })
    expect(readSyncState(GID).known.z.base).toBe('2026-11-13T09:00:00.5+00:00')
  })

  it('une plante reçue qui n’est pas valide est laissée de côté', async () => {
    server.rows.set('mauvaise', { data: { speciesId: '', position: 'ici' }, deleted: false, updated_at: '2026-11-13T09:00:00.5+00:00' })
    server.rows.set('bonne', { data: remotePlantData(plant('bonne')), deleted: false, updated_at: '2026-11-13T09:00:01.5+00:00' })
    await syncSharedGarden(garden())
    expect((store.plants as Plant[]).map((p) => p.id)).toEqual(['bonne'])
  })

  it('conflit : la version de l’autre est gardée et on le dit, sans rien perdre d’autre', async () => {
    store.plants = [plant('a')]
    await syncSharedGarden(garden())
    // Léa modifie en ligne ; moi aussi ici, avant d'avoir repris.
    const cur = server.rows.get('a')!
    server.rows.set('a', { data: { ...cur.data, notes: 'Léa' }, deleted: false, updated_at: '2026-11-13T11:00:00.5+00:00' })
    store.plants = [plant('a', { notes: 'moi' }), plant('c')]
    const r = await syncSharedGarden(garden())
    expect(r).toMatchObject({ kind: 'ok' })
    expect((r as { conflicts: string[] }).conflicts).toHaveLength(1)
    expect((store.plants as Plant[]).find((p) => p.id === 'a')?.notes).toBe('Léa')
    expect(server.rows.has('c')).toBe(true) // l'autre plante, elle, est bien partie
  })

  it('une plante supprimée ici est supprimée en ligne (douce), pas ailleurs', async () => {
    store.plants = [plant('a'), plant('b')]
    await syncSharedGarden(garden())
    store.plants = [plant('b')]
    await syncSharedGarden(garden())
    expect(server.rows.get('a')?.deleted).toBe(true)
    expect(server.rows.get('b')?.deleted).toBe(false)
  })

  it('une suppression faite par un autre retire la plante ici', async () => {
    store.plants = [plant('a')]
    await syncSharedGarden(garden())
    server.rows.set('a', { data: {}, deleted: true, updated_at: '2026-11-13T12:00:00.5+00:00' })
    await syncSharedGarden(garden())
    expect(store.plants).toEqual([])
  })

  it('le départ est reconnu quand le jardin n’est plus accessible', async () => {
    server.member = false
    expect(await syncSharedGarden(garden())).toEqual({ kind: 'left' })
    store.gardens = [garden()]
    detachGarden(garden())
    expect((store.gardens as Garden[])[0].shared).toBeUndefined()
    expect(readSyncState(GID).known).toEqual({})
  })

  it('seuls les responsables envoient la fiche du jardin', async () => {
    await syncSharedGarden(garden()) // première reprise : la fiche en ligne fait foi
    server.gardenPushes = 0
    store.gardens = [garden({ name: 'Nouveau nom' })]
    await syncSharedGarden(garden({ name: 'Nouveau nom' }))
    expect(server.gardenPushes).toBe(1)
    server.gardenPushes = 0
    store.gardens = [garden({ shared: { id: GID, role: 'member' }, name: 'Autre nom' })]
    await syncSharedGarden(garden({ shared: { id: GID, role: 'member' }, name: 'Autre nom' }))
    expect(server.gardenPushes).toBe(0)
  })

  it('entrer dans un jardin : copie locale au nom du jardin en ligne, puis plantes reprises', async () => {
    server.rows.set('z', { data: remotePlantData(plant('z')), deleted: false, updated_at: '2026-11-13T09:00:00.5+00:00' })
    store.gardens = []
    const r = await importSharedGarden(GID)
    expect(r.error).toBeUndefined()
    expect((store.gardens as Garden[])[0]).toMatchObject({ id: GID, name: 'Bruyères', shared: { id: GID, role: 'admin' } })
    expect((store.plants as Plant[]).map((p) => p.id)).toEqual(['z'])
  })

  it('l’empreinte d’une plante reprise correspond à ce qu’on a retenu', async () => {
    server.rows.set('z', { data: remotePlantData(plant('z')), deleted: false, updated_at: '2026-11-13T09:00:00.5+00:00' })
    await syncSharedGarden(garden())
    const got = (store.plants as Plant[]).find((p) => p.id === 'z')!
    expect(readSyncState(GID).known.z.hash).toBe(plantHash(got))
  })
})
