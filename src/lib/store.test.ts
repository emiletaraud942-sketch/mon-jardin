import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Faux idb-keyval partagé entre « onglets » (les modules sont ré-importés avec resetModules).
const db = new Map<string, unknown>()
const idb = {
  failGet: false,
  failSet: false as false | Error,
  sets: [] as string[],
}
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => {
    if (idb.failGet) throw new Error('lecture KO')
    return db.get(k)
  }),
  set: vi.fn(async (k: string, v: unknown) => {
    if (idb.failSet) throw idb.failSet
    idb.sets.push(k)
    db.set(k, structuredClone(v))
  }),
  del: vi.fn(async (k: string) => {
    db.delete(k)
  }),
  keys: vi.fn(async () => [...db.keys()]),
}))

// Faux BroadcastChannel : livre les messages aux autres instances du même nom.
class FakeChannel {
  static all: FakeChannel[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor(public name: string) {
    FakeChannel.all.push(this)
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all) if (c !== this && c.name === this.name) queueMicrotask(() => c.onmessage?.({ data }))
  }
  close() {}
  unref() {}
}

const KEY = 'permajardin:state:v1'
const garden = { id: 'g1', name: 'J', address: '', center: { lon: 4, lat: 45 }, createdAt: '2025-01-01T00:00:00.000Z' }
const plant = { id: 'p1', gardenId: 'g1', speciesId: 'pommier', position: { x: 0, y: 0 }, plantedAt: '2024-03-10', status: 'en-place' as const, photos: ['photo:a'] }

let win: EventTarget
let doc: EventTarget & { visibilityState: string }

async function freshStore() {
  vi.resetModules()
  return import('./store')
}

beforeEach(() => {
  db.clear()
  idb.failGet = false
  idb.failSet = false
  idb.sets = []
  FakeChannel.all = []
  win = new EventTarget()
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', doc)
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  vi.stubGlobal('navigator', {})
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loadState', () => {
  it('charge un ancien format v1 et choisit un jardin actif valide', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [], activeGardenId: 'inexistant' })
    const s = await freshStore()
    await s.loadState()
    expect(s.getState().loaded).toBe(true)
    expect(s.getState().activeGardenId).toBe('g1')
    expect(s.getState().plants).toHaveLength(1)
    expect(s.getStorageStatus().readFailed).toBe(false)
  })

  it('ne casse pas sur des données abîmées et sauvegarde l’original avant de réécrire', async () => {
    db.set(KEY, { gardens: [garden, { id: 'x' }], plants: [{ ...plant, plantedAt: 'zzz' }, { id: 'q' }], tasksDone: 'oops' })
    const s = await freshStore()
    await s.loadState()
    expect(s.getState().gardens).toHaveLength(1)
    expect(s.getState().plants).toHaveLength(1)
    expect(s.getState().tasksDone).toEqual([])
    expect(s.getLoadWarnings().length).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(300)
    const saved = db.get(KEY) as { version: number }
    expect(saved.version).toBe(2)
    expect(db.get(KEY + ':avant-migration')).toBeTruthy()
  })

  it('une base vide donne un état vide chargé, sans écriture inutile', async () => {
    const s = await freshStore()
    await s.loadState()
    await vi.advanceTimersByTimeAsync(500)
    expect(s.getState().loaded).toBe(true)
    expect(idb.sets).toEqual([])
  })

  it('stocke la version dans la donnée', async () => {
    const s = await freshStore()
    await s.loadState()
    s.addGarden(garden)
    await vi.advanceTimersByTimeAsync(300)
    expect((db.get(KEY) as { version: number }).version).toBe(2)
  })

  it('purge les tâches faites trop anciennes au chargement', async () => {
    const old = { id: 't1', gardenId: 'g1', taskKey: '2020-01-01:a:b', doneAt: '2020-01-01T00:00:00.000Z' }
    const recent = { id: 't2', gardenId: 'g1', taskKey: 'x:a:b', doneAt: new Date().toISOString() }
    db.set(KEY, { gardens: [garden], plants: [], tasksDone: [old, recent] })
    const s = await freshStore()
    await s.loadState()
    expect(s.getState().tasksDone.map((t) => t.id)).toEqual(['t2'])
  })
})

describe('sauvegarde', () => {
  it('regroupe les écritures (200 ms) puis flush() écrit immédiatement', async () => {
    const s = await freshStore()
    await s.loadState()
    s.addGarden(garden)
    expect(idb.sets).toEqual([])
    s.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(idb.sets).toEqual([KEY])
    await vi.advanceTimersByTimeAsync(500)
    expect(idb.sets).toEqual([KEY]) // pas de seconde écriture
  })

  it('écrit immédiatement sur pagehide', async () => {
    const s = await freshStore()
    await s.loadState()
    s.addGarden(garden)
    win.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(0)
    expect(db.has(KEY)).toBe(true)
  })

  it('écrit immédiatement quand la page passe en arrière-plan, pas quand elle revient', async () => {
    const s = await freshStore()
    await s.loadState()
    s.addGarden(garden)
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(db.has(KEY)).toBe(false)
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(db.has(KEY)).toBe(true)
  })

  it('un échec d’écriture renseigne writeError puis se corrige à la prochaine réussite', async () => {
    const s = await freshStore()
    await s.loadState()
    idb.failSet = new Error('plein')
    s.addGarden(garden)
    await vi.advanceTimersByTimeAsync(300)
    expect(s.getStorageStatus().writeError).toMatch(/enregistrer/i)
    idb.failSet = false
    s.updateGarden('g1', { name: 'Autre' })
    await vi.advanceTimersByTimeAsync(300)
    expect(s.getStorageStatus().writeError).toBeUndefined()
  })

  it('demande le stockage persistant au chargement', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { storage: { persist, persisted: async () => false } })
    const s = await freshStore()
    await s.loadState()
    await vi.advanceTimersByTimeAsync(0)
    expect(persist).toHaveBeenCalled()
    expect(s.getStorageStatus().persistent).toBe(true)
  })

  it('persistent reste indéfini si l’API manque ou plante', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => { throw new Error('non') } } })
    const s = await freshStore()
    await s.loadState()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.getStorageStatus().persistent).toBeUndefined()
  })
})

describe('échec de lecture', () => {
  it('ne persiste rien tant que l’utilisateur n’a pas confirmé', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [] })
    idb.failGet = true
    const s = await freshStore()
    await s.loadState()
    expect(s.getStorageStatus().readFailed).toBe(true)
    s.addGarden({ ...garden, id: 'g2' })
    s.flush()
    win.dispatchEvent(new Event('pagehide'))
    await vi.advanceTimersByTimeAsync(500)
    expect(idb.sets).toEqual([])
    expect((db.get(KEY) as { gardens: unknown[] }).gardens).toHaveLength(1)
  })

  it('reprend les écritures après resumeSaving()', async () => {
    idb.failGet = true
    const s = await freshStore()
    await s.loadState()
    s.addGarden(garden)
    await s.resumeSaving()
    await vi.advanceTimersByTimeAsync(300)
    expect(s.getStorageStatus().readFailed).toBe(false)
    expect(db.has(KEY)).toBe(true)
  })

  it('« Repartir de zéro » garde d’abord une copie des données illisibles', async () => {
    const newer = { version: 99, gardens: [garden], plants: [] }
    db.set(KEY, newer)
    const s = await freshStore()
    await s.loadState()
    expect(s.getStorageStatus().readFailed).toBe(true)
    s.addGarden({ ...garden, id: 'g2' })
    await s.resumeSaving()
    await vi.advanceTimersByTimeAsync(500)
    expect(db.get(KEY + ':illisible')).toEqual(newer)
    expect(s.getStorageStatus().readFailed).toBe(false)
    expect((db.get(KEY) as { gardens: unknown[] }).gardens).toHaveLength(1)
  })

  it('« Repartir de zéro » ne remplace rien si la copie échoue', async () => {
    db.set(KEY, { version: 99, gardens: [garden], plants: [] })
    const s = await freshStore()
    await s.loadState()
    idb.failSet = new Error('écriture KO')
    await s.resumeSaving()
    await vi.advanceTimersByTimeAsync(500)
    expect(s.getStorageStatus().readFailed).toBe(true)
    expect((db.get(KEY) as { version: number }).version).toBe(99)
  })

  it('retryLoadState() relit et lève le blocage si la lecture réussit', async () => {
    db.set(KEY, { gardens: [garden], plants: [], tasksDone: [] })
    idb.failGet = true
    const s = await freshStore()
    await s.loadState()
    idb.failGet = false
    await s.retryLoadState()
    expect(s.getStorageStatus().readFailed).toBe(false)
    expect(s.getState().gardens).toHaveLength(1)
  })

  it('une donnée plus récente que l’appli est traitée comme illisible (jamais écrasée)', async () => {
    db.set(KEY, { version: 99, gardens: [garden], plants: [] })
    const s = await freshStore()
    await s.loadState()
    expect(s.getStorageStatus().readFailed).toBe(true)
    s.addGarden({ ...garden, id: 'g2' })
    await vi.advanceTimersByTimeAsync(500)
    expect((db.get(KEY) as { version: number }).version).toBe(99)
  })

  it('replaceData (import) est une action explicite qui lève le blocage', async () => {
    idb.failGet = true
    const s = await freshStore()
    await s.loadState()
    s.replaceData({ gardens: [garden], plants: [], tasksDone: [] })
    await vi.advanceTimersByTimeAsync(300)
    expect(s.getStorageStatus().readFailed).toBe(false)
    expect(db.has(KEY)).toBe(true)
  })

  it('ne supprime aucune photo quand la lecture a échoué', async () => {
    db.set('photo:orpheline', new Blob(['x']))
    idb.failGet = true
    const s = await freshStore()
    await s.loadState()
    await s.purgeOrphanPhotos()
    expect(db.has('photo:orpheline')).toBe(true)
  })
})

describe('plusieurs onglets', () => {
  it('l’autre onglet recharge l’état quand un onglet écrit', async () => {
    const a = await freshStore()
    await a.loadState()
    const b = await freshStore()
    await b.loadState()
    a.addGarden(garden)
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(10)
    expect(b.getState().gardens.map((g) => g.id)).toEqual(['g1'])
    // et il n’a pas réécrit en retour
    expect(idb.sets).toEqual([KEY])
  })

  it('ne recharge pas par-dessus des modifications locales en attente', async () => {
    const a = await freshStore()
    await a.loadState()
    const b = await freshStore()
    await b.loadState()
    b.addGarden({ ...garden, id: 'local' })
    a.addGarden(garden)
    a.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(b.getState().gardens.map((g) => g.id)).toEqual(['local'])
    await vi.advanceTimersByTimeAsync(300) // b écrit : dernier écrivain gagne
    await vi.advanceTimersByTimeAsync(10)
    expect((db.get(KEY) as { gardens: { id: string }[] }).gardens.map((g) => g.id)).toEqual(['local'])
    expect(a.getState().gardens.map((g) => g.id)).toEqual(['local'])
  })
})

describe('effacement complet (wipeLocalData)', () => {
  it('vide IndexedDB (état, copie avant migration, photos), la mémoire, et ne réécrit rien', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [] })
    db.set(KEY + ':avant-migration', { gardens: [garden] })
    db.set('photo:a', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.updateGarden('g1', { name: 'Modifié' }) // écriture en attente
    await s.wipeLocalData()
    await vi.advanceTimersByTimeAsync(500)
    expect([...db.keys()]).toEqual([])
    expect(s.getState().gardens).toEqual([])
    expect(s.getState().plants).toEqual([])
    expect(s.getState().loaded).toBe(true)
    expect(s.getLoadWarnings()).toEqual([])
  })

  it('un autre onglet vide aussi sa mémoire et ne ressuscite pas les données', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [] })
    const a = await freshStore()
    await a.loadState()
    const b = await freshStore()
    await b.loadState()
    expect(b.getState().gardens).toHaveLength(1)
    await a.wipeLocalData()
    await vi.advanceTimersByTimeAsync(10)
    expect(b.getState().gardens).toEqual([])
    b.flush()
    await vi.advanceTimersByTimeAsync(500)
    expect(db.has(KEY)).toBe(false)
  })

  it('l’appli reste utilisable après l’effacement', async () => {
    const s = await freshStore()
    await s.loadState()
    await s.wipeLocalData()
    s.addGarden(garden)
    await vi.advanceTimersByTimeAsync(300)
    expect((db.get(KEY) as { gardens: unknown[] }).gardens).toHaveLength(1)
  })

  it('propage une erreur de suppression IndexedDB', async () => {
    const s = await freshStore()
    await s.loadState()
    const idbMod = await import('idb-keyval')
    vi.mocked(idbMod.keys).mockRejectedValueOnce(new Error('IDB KO'))
    await expect(s.wipeLocalData()).rejects.toThrow('IDB KO')
  })
})

describe('photos orphelines', () => {
  it('removePlant supprime les photos de la plante', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [] })
    db.set('photo:a', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.removePlant('p1')
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:a')).toBe(false)
  })

  it('removePlant avec keepPhotos conserve les photos (annulation possible)', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [] })
    db.set('photo:a', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.removePlant('p1', { keepPhotos: true })
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:a')).toBe(true)
  })

  it('removeGarden supprime les photos de ses plantes', async () => {
    db.set(KEY, { gardens: [garden, { ...garden, id: 'g2' }], plants: [plant, { ...plant, id: 'p2', gardenId: 'g2', photos: ['photo:b'] }], tasksDone: [] })
    db.set('photo:a', new Blob(['x']))
    db.set('photo:b', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.removeGarden('g1')
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:a')).toBe(false)
    expect(db.has('photo:b')).toBe(true)
  })

  it('replaceData supprime les photos des plantes retirées, sauf celles encore référencées', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant, { ...plant, id: 'p2', photos: ['photo:b'] }], tasksDone: [] })
    db.set('photo:a', new Blob(['x']))
    db.set('photo:b', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.replaceData({ gardens: [garden], plants: [{ ...plant, id: 'p9', photos: ['photo:a'] }], tasksDone: [] })
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:a')).toBe(true)
    expect(db.has('photo:b')).toBe(false)
  })

  it('purgeOrphanPhotos supprime les blobs non référencés au chargement, pas les autres clés', async () => {
    db.set(KEY, { gardens: [garden], plants: [plant], tasksDone: [] })
    db.set('photo:a', new Blob(['x']))
    db.set('photo:orpheline', new Blob(['x']))
    db.set('autre', 1)
    const s = await freshStore()
    await s.loadState()
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:a')).toBe(true)
    expect(db.has('photo:orpheline')).toBe(false)
    expect(db.has('autre')).toBe(true)
  })
})

describe('photos des points de vue (panoramas)', () => {
  const panoGarden = { ...garden, panoramas: [{ id: 'pv1', x: 1, y: 2, takenAt: '2026-05-03T10:00:00.000Z', kind: 'guide', shots: [{ photoId: 'photo:v1', headingDeg: 0, fovDeg: 60 }, { photoId: 'photo:v2', headingDeg: 45, fovDeg: 60 }] }] }

  it('purgeOrphanPhotos garde les photos des points de vue et supprime les autres', async () => {
    db.set(KEY, { gardens: [panoGarden], plants: [], tasksDone: [] })
    db.set('photo:v1', new Blob(['x']))
    db.set('photo:v2', new Blob(['x']))
    db.set('photo:orpheline', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:v1')).toBe(true)
    expect(db.has('photo:v2')).toBe(true)
    expect(db.has('photo:orpheline')).toBe(false)
  })

  it('removeGarden supprime les photos de ses points de vue', async () => {
    db.set(KEY, { gardens: [panoGarden, { ...garden, id: 'g2' }], plants: [], tasksDone: [] })
    db.set('photo:v1', new Blob(['x']))
    db.set('photo:v2', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.removeGarden('g1')
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:v1')).toBe(false)
    expect(db.has('photo:v2')).toBe(false)
  })

  it('replaceData (import, synchro) garde les points de vue de cet appareil', async () => {
    db.set(KEY, { gardens: [panoGarden], plants: [], tasksDone: [] })
    db.set('photo:v1', new Blob(['x']))
    db.set('photo:v2', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.replaceData({ gardens: [{ ...garden, name: 'Importé' }], plants: [], tasksDone: [] })
    await vi.advanceTimersByTimeAsync(10)
    expect(s.getState().gardens[0].name).toBe('Importé')
    expect(s.getState().gardens[0].panoramas).toHaveLength(1)
    expect(db.has('photo:v1')).toBe(true)
  })

  it('replaceData supprime les photos des points d’un jardin qui disparaît', async () => {
    db.set(KEY, { gardens: [panoGarden], plants: [], tasksDone: [] })
    db.set('photo:v1', new Blob(['x']))
    const s = await freshStore()
    await s.loadState()
    s.replaceData({ gardens: [{ ...garden, id: 'autre' }], plants: [], tasksDone: [] })
    await vi.advanceTimersByTimeAsync(10)
    expect(db.has('photo:v1')).toBe(false)
  })
})

