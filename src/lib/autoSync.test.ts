import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { autoSyncMessage, createAutoSync, getAutoSyncState, resetAutoSync, type AutoSyncDeps } from './autoSync'

class ConflictError extends Error {}

interface Fake {
  state: { gardens: unknown[]; plants: unknown[]; tasksDone: unknown[]; loaded: boolean }
  listeners: Set<() => void>
  dirty: boolean
  remote: { signedIn: boolean; remote: string | null; last: string | null }
  push: Mock<() => Promise<void>>
  pull: Mock<() => Promise<boolean>>
  consent: boolean
  online: boolean
  change(): void
  deps: AutoSyncDeps
}

function fake(init: Partial<Pick<Fake, 'remote' | 'dirty' | 'consent'>> & { data?: boolean } = {}): Fake {
  const f: Fake = {
    state: { gardens: init.data === false ? [] : [{ id: 'g' }], plants: init.data === false ? [] : [{ id: 'p' }], tasksDone: [], loaded: true },
    listeners: new Set(),
    dirty: init.dirty ?? false,
    remote: init.remote ?? { signedIn: true, remote: null, last: null },
    push: vi.fn(async () => undefined),
    pull: vi.fn(async () => true),
    consent: init.consent ?? true,
    online: true,
    change() {
      f.state = { ...f.state, plants: [...f.state.plants, { id: 'n' + Math.random() }] }
      f.listeners.forEach((l) => l())
    },
    deps: undefined as unknown as AutoSyncDeps,
  }
  f.deps = {
    getState: () => f.state as never,
    subscribe: (l) => {
      f.listeners.add(l)
      return () => void f.listeners.delete(l)
    },
    remote: async () => f.remote,
    push: () => f.push(),
    pull: () => f.pull().then((r: boolean) => {
      f.state = { ...f.state, plants: [{ id: 'distant' }] } // la reprise remplace l'état local
      f.listeners.forEach((l) => l())
      return r
    }),
    hasConsent: () => f.consent,
    isConflict: (e) => e instanceof ConflictError,
    online: () => f.online,
    now: () => Date.now(),
    readDirty: () => f.dirty,
    writeDirty: (v) => void (f.dirty = v),
    delayMs: 5000,
  }
  return f
}

beforeEach(() => {
  resetAutoSync()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'

describe('synchronisation automatique : au démarrage', () => {
  it('rien en ligne et des données ici : envoie', async () => {
    const f = fake()
    const a = createAutoSync(f.deps)
    await a.reconcile()
    expect(f.push).toHaveBeenCalledTimes(1)
    expect(getAutoSyncState().status).toBe('ok')
  })
  it('rien en ligne et rien ici : n’envoie pas une copie vide', async () => {
    const f = fake({ data: false })
    await createAutoSync(f.deps).reconcile()
    expect(f.push).not.toHaveBeenCalled()
  })
  it('copie en ligne plus récente, rien de modifié ici : reprend', async () => {
    const f = fake({ remote: { signedIn: true, remote: T2, last: T1 } })
    await createAutoSync(f.deps).reconcile()
    expect(f.pull).toHaveBeenCalledTimes(1)
    expect(f.push).not.toHaveBeenCalled()
    expect(f.dirty).toBe(false)
  })
  it('copie en ligne plus récente ET modifications ici : CONFLIT, rien n’est écrasé', async () => {
    const f = fake({ remote: { signedIn: true, remote: T2, last: T1 }, dirty: true })
    await createAutoSync(f.deps).reconcile()
    expect(f.pull).not.toHaveBeenCalled()
    expect(f.push).not.toHaveBeenCalled()
    expect(getAutoSyncState().status).toBe('conflit')
  })
  it('appareil jamais synchronisé, copie en ligne existante, données ici : CONFLIT', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: null } })
    await createAutoSync(f.deps).reconcile()
    expect(f.pull).not.toHaveBeenCalled()
    expect(f.push).not.toHaveBeenCalled()
    expect(getAutoSyncState().status).toBe('conflit')
  })
  it('appareil neuf (aucune donnée) et copie en ligne : reprend', async () => {
    const f = fake({ data: false, remote: { signedIn: true, remote: T1, last: null } })
    await createAutoSync(f.deps).reconcile()
    expect(f.pull).toHaveBeenCalledTimes(1)
  })
  it('à jour des deux côtés : ne fait rien ; modifié seulement ici : envoie', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: T1 } })
    await createAutoSync(f.deps).reconcile()
    expect(f.push).not.toHaveBeenCalled()
    expect(f.pull).not.toHaveBeenCalled()
    f.dirty = true
    await createAutoSync(f.deps).reconcile()
    expect(f.push).toHaveBeenCalledTimes(1)
  })
  it('sans accord ou sans compte : inactif, aucun appel', async () => {
    const f = fake({ consent: false })
    await createAutoSync(f.deps).reconcile()
    expect(getAutoSyncState().status).toBe('inactif')
    const g = fake({ remote: { signedIn: false, remote: null, last: null } })
    await createAutoSync(g.deps).reconcile()
    expect(g.push).not.toHaveBeenCalled()
    expect(f.push).not.toHaveBeenCalled()
  })
})

describe('synchronisation automatique : après une modification', () => {
  it('une rafale de modifications ne fait qu’un envoi, 5 s après la dernière', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: T1 } })
    const a = createAutoSync(f.deps)
    await a.reconcile()
    f.change()
    await vi.advanceTimersByTimeAsync(3000)
    f.change()
    f.change()
    await vi.advanceTimersByTimeAsync(4000)
    expect(f.push).not.toHaveBeenCalled() // la dernière modification date de 4 s
    await vi.advanceTimersByTimeAsync(1500)
    expect(f.push).toHaveBeenCalledTimes(1)
    expect(f.dirty).toBe(false)
    a.stop()
  })
  it('la modification est mémorisée comme « à envoyer » tout de suite (survit à une fermeture)', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: T1 } })
    const a = createAutoSync(f.deps)
    await a.reconcile()
    f.change()
    expect(f.dirty).toBe(true)
    a.stop()
  })
  it('un conflit à l’envoi arrête les envois suivants et le dit', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: T1 } })
    f.push.mockRejectedValueOnce(new ConflictError('autre appareil'))
    const a = createAutoSync(f.deps)
    await a.reconcile()
    f.change()
    await vi.advanceTimersByTimeAsync(5100)
    expect(getAutoSyncState().status).toBe('conflit')
    f.change()
    await vi.advanceTimersByTimeAsync(6000)
    expect(f.push).toHaveBeenCalledTimes(1) // pas de deuxième tentative tant que rien n'est réglé
    a.resolved()
    expect(getAutoSyncState().status).toBe('ok')
    a.stop()
  })
  it('hors ligne : état « hors ligne », les modifications restent à envoyer', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: T1 } })
    f.push.mockRejectedValueOnce(new Error('Failed to fetch'))
    f.online = false
    const a = createAutoSync(f.deps)
    await a.reconcile()
    f.change()
    await vi.advanceTimersByTimeAsync(5100)
    expect(getAutoSyncState().status).toBe('hors-ligne')
    expect(f.dirty).toBe(true)
    a.stop()
  })
  it('erreur serveur : état « erreur » avec le message, les données restent marquées à envoyer', async () => {
    const f = fake({ remote: { signedIn: true, remote: T1, last: T1 } })
    f.push.mockRejectedValueOnce(new Error('Accès refusé. Reconnectez-vous puis réessayez.'))
    const a = createAutoSync(f.deps)
    await a.reconcile()
    f.change()
    await vi.advanceTimersByTimeAsync(5100)
    expect(getAutoSyncState()).toMatchObject({ status: 'erreur', error: 'Accès refusé. Reconnectez-vous puis réessayez.' })
    expect(f.dirty).toBe(true)
    a.stop()
  })
  it('la reprise de la copie en ligne n’est pas prise pour une modification locale', async () => {
    const f = fake({ remote: { signedIn: true, remote: T2, last: T1 } })
    const a = createAutoSync(f.deps)
    await a.reconcile()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.push).not.toHaveBeenCalled()
    expect(f.dirty).toBe(false)
    a.stop()
  })
  it('sans accord : une modification est mémorisée mais rien n’est envoyé', async () => {
    const f = fake({ consent: false })
    const a = createAutoSync(f.deps)
    f.change()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.push).not.toHaveBeenCalled()
    expect(f.dirty).toBe(true)
    a.stop()
  })
})

describe('autoSyncMessage', () => {
  it('une phrase courte par état, et jamais plus de 20 mots', () => {
    const states = ['inactif', 'en-cours', 'ok', 'conflit', 'hors-ligne', 'erreur'] as const
    for (const status of states) {
      const text = autoSyncMessage({ status, lastAt: new Date(2026, 9, 28, 14, 32).getTime() })
      expect(text.length, status).toBeGreaterThan(10)
      for (const sentence of text.split(/(?<=[.!?])\s+/)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20)
    }
    expect(autoSyncMessage({ status: 'ok', lastAt: new Date(2026, 9, 28, 14, 32).getTime() })).toContain('14:32')
    expect(autoSyncMessage({ status: 'erreur', error: 'Accès refusé.' })).toContain('Accès refusé.')
  })
})
