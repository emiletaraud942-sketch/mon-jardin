import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => undefined, del: async () => undefined, keys: async () => [] }))

const item = (id: string, status: string) => ({ id, gardenId: 'g1', photoId: 'photo:abc' + id, createdAt: '2026-11-01T00:00:00.000Z', position: { x: 1, y: 2 }, accuracyM: 4, status, attempts: 0, suggestions: [], plantStatus: 'en-place' })

describe('file du scan reprise de la copie en ligne', () => {
  it('ajoute ce qui manque, garde l’état le plus avancé et signale ce qui reste à envoyer', async () => {
    const { mergeRemoteQueue, getQueue, updateQueue } = await import('./queueStore')
    updateQueue(() => [item('a', 'a-valider') as never, item('b', 'a-valider') as never])
    const aRenvoyer = await mergeRemoteQueue([item('b', 'validee'), item('c', 'a-valider')])
    const q = getQueue()
    expect(q.map((i) => i.id).sort()).toEqual(['a', 'b', 'c'])
    expect(q.find((i) => i.id === 'b')?.status).toBe('validee')
    expect(aRenvoyer).toBe(true)
  })
})
