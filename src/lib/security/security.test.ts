import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { migrateState } from '../migrate'
import { importSizeError, parseBackupText, readBackupFile } from './import'
import { imageSize, jpegMetadataSegments, sizeWithinLimits } from './image'
import { DATA_INVENTORY, ERASABLE_CACHE, ERASABLE_LOCAL_KEY, getDataInventory, PERMISSIONS } from './inventory'
import { LIMITS } from './limits'
import { cleanJson, clipText, isPhotoId, isSafeId } from './sanitize'
import { clearLocalKeys, clearPlaceCaches } from './erase'
import { imageSize as apiImageSize } from '../../../api/identify'

const garden = { id: 'g1', name: 'Jardin', address: 'Lyon', center: { lon: 4.83, lat: 45.76 }, createdAt: '2025-01-01T00:00:00.000Z' }
const plant = { id: 'p1', gardenId: 'g1', speciesId: 'pommier', position: { x: 1, y: 2 }, plantedAt: '2024-03-10', status: 'en-place', photos: [] as unknown[] }

const ok = (raw: unknown) => {
  const r = migrateState(raw)
  if (!r.ok) throw new Error('attendu ok : ' + r.error)
  return r
}
/** JSON.parse crée de vraies clés « __proto__ » (un littéral d'objet, lui, change le prototype). */
const hostile = (json: string) => JSON.parse(json)

describe('sanitize', () => {
  it('clipText coupe sans casser un emoji', () => {
    expect(clipText('abcdef', 3)).toBe('abc')
    expect(clipText('ab😀', 3)).toBe('ab') // 😀 = 2 unités UTF-16 : on ne garde pas la moitié
    expect(clipText('court', 50)).toBe('court')
  })
  it('isPhotoId n’accepte que « photo: » + alphanumérique', () => {
    expect(isPhotoId('photo:abc123XYZ')).toBe(true)
    for (const bad of ['permajardin:state:v1', 'photo:', 'photo:../x', 'photo:a b', 'Photo:abc', 'photo:' + 'a'.repeat(65), '', 42, null, undefined, {}, ['photo:a']]) {
      expect(isPhotoId(bad)).toBe(false)
    }
  })
  it('isSafeId refuse vide, trop long et noms dangereux', () => {
    expect(isSafeId('g1')).toBe(true)
    for (const bad of ['', '   ', '__proto__', 'constructor', 'prototype', 'x'.repeat(LIMITS.idLength + 1), 5, null]) expect(isSafeId(bad)).toBe(false)
  })
  it('cleanJson retire les clés dangereuses à toute profondeur, borne profondeur et nombres non finis', () => {
    const out = cleanJson(hostile('{"a":{"__proto__":{"x":1},"b":1,"constructor":{"prototype":{}}},"n":1}')) as Record<string, any>
    expect(Object.prototype.hasOwnProperty.call(out.a, '__proto__')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(out.a, 'constructor')).toBe(false)
    expect(out.a.b).toBe(1)
    expect(cleanJson(Infinity)).toBeUndefined()
    expect(cleanJson(() => 1)).toBeUndefined()
    expect(cleanJson(BigInt(1))).toBeUndefined()
    let deep: unknown = 1
    for (let i = 0; i < 50; i++) deep = [deep]
    expect(JSON.stringify(cleanJson(deep))).not.toContain('1')
    expect(cleanJson(new Date())).toBeUndefined() // objet non simple
    expect((cleanJson('x'.repeat(LIMITS.longText + 10)) as string).length).toBe(LIMITS.longText)
  })
})

describe('migrateState : données hostiles', () => {
  it('ne conserve ni __proto__ ni constructor, et ne pollue pas Object.prototype', () => {
    const g = hostile('{"id":"g1","name":"J","center":{"lon":4,"lat":45},"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}},"extra":{"__proto__":{"deep":1},"ok":2}}')
    const p = hostile('{"id":"p1","gardenId":"g1","speciesId":"x","position":{"x":1,"y":2},"__proto__":{"polluted":true},"photos":[]}')
    const r = ok({ gardens: [g], plants: [p], tasksDone: [hostile('{"id":"t1","gardenId":"g1","taskKey":"a:b","doneAt":"2025-01-01","__proto__":{"polluted":1}}')] })
    for (const o of [r.data.gardens[0], r.data.plants[0], r.data.tasksDone[0]] as object[]) {
      expect(Object.prototype.hasOwnProperty.call(o, '__proto__')).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(o, 'constructor')).toBe(false)
      expect(Object.assign({}, o)).not.toHaveProperty('polluted')
    }
    const extra = (r.data.gardens[0] as unknown as { extra: Record<string, unknown> }).extra
    expect(extra.ok).toBe(2)
    expect(Object.prototype.hasOwnProperty.call(extra, '__proto__')).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('refuse les identifiants dangereux ou démesurés', () => {
    const r = ok({
      gardens: [{ ...garden, id: '__proto__' }, { ...garden, id: 'x'.repeat(500) }, garden],
      plants: [{ ...plant, id: 'constructor' }, { ...plant, speciesId: 'x'.repeat(500) }, plant],
    })
    expect(r.data.gardens.map((g) => g.id)).toEqual(['g1'])
    expect(r.data.plants.map((p) => p.id)).toEqual(['p1'])
  })

  it('raccourcit les textes trop longs (500 / 5 000 caractères)', () => {
    const r = ok({
      gardens: [{ ...garden, name: 'N'.repeat(2_000_000), address: 'A'.repeat(10_000), parcelRefs: Array(200).fill('R'.repeat(1000)) }],
      plants: [{ ...plant, notes: 'x'.repeat(1_000_000), customName: 'c'.repeat(9999) }],
    })
    const g = r.data.gardens[0]
    expect(g.name.length).toBe(LIMITS.shortText)
    expect(g.address.length).toBe(LIMITS.shortText)
    expect(g.parcelRefs).toHaveLength(LIMITS.parcelRefs)
    expect(g.parcelRefs![0].length).toBe(LIMITS.parcelRefLength)
    expect(r.data.plants[0].notes!.length).toBe(LIMITS.longText)
    expect(r.data.plants[0].customName!.length).toBe(LIMITS.shortText)
  })

  it('ne garde que les identifiants de photo au bon format (plafonné à 20)', () => {
    const photos = ['photo:abc', 'permajardin:state:v1', 'photo:../../x', 'photo:', 42, null, 'photo:ok1', ...Array.from({ length: 40 }, (_, i) => 'photo:z' + i)]
    const r = ok({ gardens: [garden], plants: [{ ...plant, photos }] })
    expect(r.data.plants[0].photos.slice(0, 2)).toEqual(['photo:abc', 'photo:ok1'])
    expect(r.data.plants[0].photos.length).toBe(LIMITS.photosPerPlant)
    expect(r.data.plants[0].photos.every(isPhotoId)).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/photo invalide/)
  })

  it('photos de mauvais type : tableau vide, sans plantage', () => {
    expect(ok({ gardens: [garden], plants: [{ ...plant, photos: 'photo:abc' }] }).data.plants[0].photos).toEqual([])
    expect(ok({ gardens: [garden], plants: [{ ...plant, photos: { 0: 'photo:a' } }] }).data.plants[0].photos).toEqual([])
  })

  it('plafonne le nombre de jardins (50) et de plantes (20 000) en le signalant', () => {
    const gardens = Array.from({ length: 80 }, (_, i) => ({ ...garden, id: 'g' + i }))
    const plants = Array.from({ length: 20_050 }, (_, i) => ({ ...plant, id: 'p' + i, gardenId: 'g0' }))
    const r = ok({ gardens, plants })
    expect(r.data.gardens).toHaveLength(LIMITS.gardens)
    expect(r.data.plants).toHaveLength(LIMITS.plants)
    expect(r.warnings.join(' ')).toMatch(/30 jardins en trop/)
    expect(r.warnings.join(' ')).toMatch(/50 plantes en trop/)
  })

  it('plafonne les tâches faites en gardant les plus récentes (fin du tableau)', () => {
    const tasksDone = Array.from({ length: LIMITS.tasksDone + 5 }, (_, i) => ({ id: 't' + i, gardenId: 'g1', taskKey: 'k' + i, doneAt: '2025-01-01' }))
    const r = ok({ gardens: [garden], tasksDone })
    expect(r.data.tasksDone).toHaveLength(LIMITS.tasksDone)
    expect(r.data.tasksDone.at(-1)!.id).toBe('t' + (LIMITS.tasksDone + 4))
  })

  it('écarte nombres non finis, positions démesurées et contours géants', () => {
    const bigRing = Array.from({ length: LIMITS.ringPoints + 1 }, (_, i) => ({ x: i % 10, y: Math.floor(i / 10) % 10 }))
    const r = ok({
      gardens: [{ ...garden, altitudeM: 1e308, areaM2: -5, parcel: bigRing, buildings: [{ id: 'b1', ring: bigRing, heightM: 5 }, { id: 'b2', ring: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], heightM: 5 }] }],
      plants: [{ ...plant, position: { x: 1e300, y: 0 } }, { ...plant, id: 'p2', position: { x: Infinity, y: 0 } }, { ...plant, id: 'p3', ageAtPlanting: 1e9 }],
    })
    const g = r.data.gardens[0]
    expect(g.altitudeM).toBeUndefined()
    expect(g.areaM2).toBeUndefined()
    expect(g.parcel).toBeUndefined()
    expect(g.buildings!.map((b) => b.id)).toEqual(['b2'])
    expect(r.data.plants.map((p) => p.id)).toEqual(['p3'])
    expect(r.data.plants[0].ageAtPlanting).toBeUndefined()
  })

  it('refuse un relief aux dimensions démesurées (n × n points)', () => {
    const terrain = { size: 10, n: 100_000, heights: [0, 1] }
    expect(ok({ gardens: [{ ...garden, terrain }] }).data.gardens[0].terrain).toBeUndefined()
    expect(ok({ gardens: [{ ...garden, terrain: { size: 1e9, n: 2, heights: [0, 0, 0, 0] } }] }).data.gardens[0].terrain).toBeUndefined()
  })

  it('types faux partout : pas de plantage', () => {
    const weird: unknown[] = [null, undefined, 1, 'x', [], [[]], {}, true, { id: {}, center: [] }, () => 1]
    for (const w of weird) {
      expect(() => migrateState({ gardens: [w, garden], plants: [w, plant], tasksDone: [w] })).not.toThrow()
      expect(() => migrateState({ gardens: [{ ...garden, buildings: w, parcel: w, terrain: w, parcelRefs: w, sol: w }], plants: [{ ...plant, position: w, notes: w, photos: w }] })).not.toThrow()
    }
  })

  it('garde les champs inconnus d’une version future (nettoyés)', () => {
    const r = ok({ gardens: [{ ...garden, futur: { a: [1, 2, 3], s: 'x' } }], plants: [{ ...plant, couleur: 'rouge' }] })
    expect((r.data.gardens[0] as unknown as Record<string, unknown>).futur).toEqual({ a: [1, 2, 3], s: 'x' })
    expect((r.data.plants[0] as unknown as Record<string, unknown>).couleur).toBe('rouge')
  })

  it('un champ inconnu énorme est rabogné, pas copié tel quel', () => {
    const r = ok({ gardens: [{ ...garden, bomb: { s: 'x'.repeat(10_000_000) } }] })
    const bomb = (r.data.gardens[0] as unknown as { bomb: { s: string } }).bomb
    expect(bomb.s.length).toBe(LIMITS.longText)
  })
})

describe('import de fichier', () => {
  it('refuse un fichier de plus de 10 Mo AVANT de le lire', async () => {
    const text = vi.fn(async () => '{}')
    const r = await readBackupFile({ size: LIMITS.importBytes + 1, text })
    expect(r.ok).toBe(false)
    expect(text).not.toHaveBeenCalled()
    expect(importSizeError(1000)).toBeUndefined()
  })
  it('JSON invalide ou imbriqué à l’excès : erreur propre, jamais d’exception', () => {
    expect(parseBackupText('pas du json').ok).toBe(false)
    expect(parseBackupText('['.repeat(2_000_000)).ok).toBe(false)
    expect(parseBackupText('x'.repeat(LIMITS.importBytes + 1)).ok).toBe(false)
    expect(parseBackupText('{"gardens":[]}').ok).toBe(true)
  })
  it('lecture impossible : erreur propre', async () => {
    const r = await readBackupFile({ size: 10, text: async () => { throw new Error('KO') } })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/illisible/) })
  })
})

describe('image : en-têtes et métadonnées', () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    new DataView(b.buffer).setUint32(16, w)
    new DataView(b.buffer).setUint32(20, h)
    return b
  }
  const jpeg = (w: number, h: number, withExif = false) => {
    const exif = withExif ? [0xff, 0xe1, 0x00, 0x10, ...Buffer.from('Exif\0\0GPS-DATA')] : []
    return Uint8Array.from([0xff, 0xd8, ...exif, 0xff, 0xc0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9])
  }
  it('lit les dimensions PNG, JPEG (après un segment EXIF) et WebP', () => {
    expect(imageSize(png(30000, 40000))).toEqual({ mime: 'image/png', width: 30000, height: 40000 })
    expect(imageSize(jpeg(640, 480, true))).toEqual({ mime: 'image/jpeg', width: 640, height: 480 })
    const vp8x = new Uint8Array(30)
    vp8x.set(Buffer.from('RIFF'), 0)
    vp8x.set(Buffer.from('WEBP'), 8)
    vp8x.set(Buffer.from('VP8X'), 12)
    vp8x.set([0x0f, 0x27, 0, 0x9f, 0x0f, 0], 24) // 9999 × 4000
    expect(imageSize(vp8x)).toEqual({ mime: 'image/webp', width: 10000, height: 4000 })
  })
  it('la copie de api/identify.ts donne exactement les mêmes dimensions (anti-dérive)', () => {
    const vp8l = new Uint8Array(30)
    vp8l.set(Buffer.from('RIFF'), 0)
    vp8l.set(Buffer.from('WEBP'), 8)
    vp8l.set(Buffer.from('VP8L'), 12)
    vp8l[20] = 0x2f
    vp8l.set([0x7f, 0xc0, 0x0f, 0x00], 21)
    for (const f of [png(640, 480), png(30000, 1), jpeg(1280, 720, true), jpeg(1, 1), vp8l, Uint8Array.from([0xff, 0xd8, 0xff]), new Uint8Array(), Buffer.from('texte')]) {
      const a = imageSize(f)
      expect(apiImageSize(f)).toEqual(a ? { width: a.width, height: a.height } : undefined)
    }
  })
  it('renvoie undefined pour tronqué, inconnu ou incohérent', () => {
    expect(imageSize(new Uint8Array())).toBeUndefined()
    expect(imageSize(Uint8Array.from([0xff, 0xd8, 0xff]))).toBeUndefined()
    expect(imageSize(Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0x00, 0x00]))).toBeUndefined()
    expect(imageSize(Buffer.from('GIF89a000000000000000000000000000'))).toBeUndefined()
  })
  it('sizeWithinLimits refuse les bombes de décompression', () => {
    expect(sizeWithinLimits({ width: 4000, height: 3000 }, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)).toBe(true)
    expect(sizeWithinLimits({ width: 30000, height: 30000 }, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)).toBe(false)
    expect(sizeWithinLimits({ width: 16000, height: 16000 }, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)).toBe(false) // 256 Mpx
    expect(sizeWithinLimits({ width: 0, height: 10 }, LIMITS.photoMaxSide, LIMITS.photoMaxPixels)).toBe(false)
  })
  it('jpegMetadataSegments repère EXIF, XMP, IPTC et commentaires', () => {
    expect(jpegMetadataSegments(jpeg(10, 10, true))).toEqual(['EXIF'])
    expect(jpegMetadataSegments(jpeg(10, 10, false))).toEqual([])
    const withCom = Uint8Array.from([0xff, 0xd8, 0xff, 0xfe, 0, 4, 65, 66, 0xff, 0xed, 0, 4, 1, 2, 0xff, 0xd9])
    expect(jpegMetadataSegments(withCom)).toEqual(['COM', 'IPTC'])
  })
})

describe('photos : identifiants forgés', () => {
  const db = new Map<string, unknown>([['permajardin:state:v1', { gardens: [] }], ['photo:abc', new Blob(['x'])]])
  const calls: string[] = []
  beforeEach(() => {
    calls.length = 0
    vi.resetModules()
    vi.doMock('idb-keyval', () => ({
      get: async (k: string) => (calls.push('get:' + k), db.get(k)),
      set: async (k: string, v: unknown) => void db.set(k, v),
      del: async (k: string) => (calls.push('del:' + k), void db.delete(k)),
      keys: async () => [...db.keys()],
    }))
  })
  afterEach(() => {
    vi.doUnmock('idb-keyval')
    vi.unstubAllGlobals()
  })

  it('getPhoto/deletePhoto ne touchent jamais une clé qui n’est pas une photo', async () => {
    const p = await import('../photos')
    expect(await p.getPhoto('permajardin:state:v1')).toBeUndefined()
    await p.deletePhoto('permajardin:state:v1')
    await p.deletePhoto('photo:../x')
    expect(calls).toEqual([])
    expect(db.has('permajardin:state:v1')).toBe(true)
    expect(await p.getPhoto('photo:abc')).toBeInstanceOf(Blob)
    expect(await p.listPhotoIds()).toEqual(['photo:abc'])
  })

  it('refuse une photo dont l’en-tête annonce 30 000 × 30 000 px, sans la décoder', async () => {
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const header = new Uint8Array(33)
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
    new DataView(header.buffer).setUint32(16, 30000)
    new DataView(header.buffer).setUint32(20, 30000)
    const p = await import('../photos')
    await expect(p.compressToTarget(new Blob([header]))).rejects.toThrow(/trop grande/)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('refuse un fichier de plus de 40 Mo sans le lire', async () => {
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const fake = { size: LIMITS.photoInputBytes + 1, slice: vi.fn() } as unknown as Blob
    const p = await import('../photos')
    await expect(p.compressToTarget(fake)).rejects.toThrow(/trop grande/)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('refuse un bitmap décodé démesuré (en-tête illisible)', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 40000, height: 40000, close })))
    const p = await import('../photos')
    await expect(p.compressToTarget(new Blob(['pas un en-tête connu']))).rejects.toThrow(/trop grande/)
    expect(close).toHaveBeenCalled()
  })
})

describe('effacement', () => {
  it('clearLocalKeys retire permajardin:*, pj-*, pj.* et sb-*, et rien d’autre', () => {
    const data = new Map([['permajardin:theme', 'dark'], ['permajardin:last-synced:u1', 'x'], ['pj-meteo:45.760,4.830', '{}'], ['pj-climat:1,2', '{}'], ['pj.guide', '{"g1":true}'], ['pj.lidar', '1'], ['sb-abc-auth-token', 'jwt'], ['autre-site', 'garde']])
    const storage = {
      get length() { return data.size },
      key: (i: number) => [...data.keys()][i] ?? null,
      removeItem: (k: string) => void data.delete(k),
    } as unknown as Storage
    const removed = clearLocalKeys(storage)
    expect(removed.sort()).toEqual(['permajardin:last-synced:u1', 'permajardin:theme', 'pj-climat:1,2', 'pj-meteo:45.760,4.830', 'pj.guide', 'pj.lidar', 'sb-abc-auth-token'])
    expect([...data.keys()]).toEqual(['autre-site'])
  })

  it('clearPlaceCaches ne supprime que les caches ign-*', async () => {
    const names = new Set(['ign-tuiles', 'ign-ortho-3d', 'chunk-3d', 'workbox-precache-v2-https://x/'])
    const removed = await clearPlaceCaches({ keys: async () => [...names], delete: async (n: string) => names.delete(n) })
    expect(removed.sort()).toEqual(['ign-ortho-3d', 'ign-tuiles'])
    expect([...names].sort()).toEqual(['chunk-3d', 'workbox-precache-v2-https://x/'])
  })

  it('toute clé localStorage écrite par le code source est couverte par l’effacement', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) files.push(p)
      }
    }
    walk(join(__dirname, '..', '..'))
    const found = new Set<string>()
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/['"`]((?:permajardin|pj-[a-z]+):[^'"`$]*|pj\.[A-Za-z0-9]+)['"`]?/g)) found.add(m[1])
    }
    expect(found.size).toBeGreaterThan(3)
    for (const k of found) expect(ERASABLE_LOCAL_KEY.test(k), k).toBe(true)
    expect(ERASABLE_CACHE.test('ign-tuiles')).toBe(true)
  })
})

describe('eraseAllData', () => {
  afterEach(() => {
    vi.doUnmock('../store')
    vi.doUnmock('../sync')
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function setup(opts: { wipe?: () => Promise<void>; sync?: Record<string, unknown>; configured?: boolean } = {}) {
    vi.resetModules()
    const wipe = vi.fn(opts.wipe ?? (async () => undefined))
    const sync = { deleteRemoteSnapshot: vi.fn(async () => undefined), deleteMyAccount: vi.fn(async () => undefined), signOutLocal: vi.fn(async () => undefined), ...opts.sync }
    vi.doMock('../store', () => ({ wipeLocalData: wipe }))
    vi.doMock('../sync', () => sync)
    vi.stubEnv('VITE_SUPABASE_URL', opts.configured === false ? '' : 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', opts.configured === false ? '' : 'anon')
    const data = new Map([['permajardin:x', '1'], ['pj-meteo:1,2', '{}']])
    vi.stubGlobal('localStorage', { get length() { return data.size }, key: (i: number) => [...data.keys()][i] ?? null, removeItem: (k: string) => void data.delete(k) })
    const names = new Set(['ign-tuiles', 'chunk-3d'])
    vi.stubGlobal('caches', { keys: async () => [...names], delete: async (n: string) => names.delete(n) })
    const mod = await import('./erase')
    return { mod, wipe, sync, data, names }
  }

  it('efface appareil seulement par défaut, puis déconnecte localement', async () => {
    const { mod, wipe, sync, data, names } = await setup()
    const r = await mod.eraseAllData()
    expect(r.ok).toBe(true)
    expect(wipe).toHaveBeenCalledOnce()
    expect(data.size).toBe(0)
    expect([...names]).toEqual(['chunk-3d'])
    expect(sync.deleteRemoteSnapshot).not.toHaveBeenCalled()
    expect(sync.signOutLocal).toHaveBeenCalled()
    expect(r.manual.join(' ')).toMatch(/notifications/)
  })

  it('remote: snapshot / account appellent la bonne suppression en ligne AVANT la déconnexion', async () => {
    const order: string[] = []
    const a = await setup({ sync: { deleteRemoteSnapshot: vi.fn(async () => void order.push('snapshot')), signOutLocal: vi.fn(async () => void order.push('signout')) } })
    await a.mod.eraseAllData({ remote: 'snapshot' })
    expect(order).toEqual(['snapshot', 'signout'])
    const b = await setup()
    await b.mod.eraseAllData({ remote: 'account' })
    expect(b.sync.deleteMyAccount).toHaveBeenCalled()
  })

  it('échec en ligne : le reste est effacé, la session est gardée pour réessayer, le rapport le dit', async () => {
    const { mod, sync, data } = await setup({ sync: { deleteRemoteSnapshot: vi.fn(async () => { throw new Error('Hors ligne') }) } })
    const r = await mod.eraseAllData({ remote: 'snapshot' })
    expect(r.ok).toBe(false)
    expect(r.steps.find((s) => s.id === 'remote')).toEqual({ id: 'remote', ok: false, error: 'Hors ligne' })
    expect(data.size).toBe(0)
    expect(sync.signOutLocal).not.toHaveBeenCalled()
  })

  it('un échec IndexedDB n’empêche pas d’effacer localStorage et les caches', async () => {
    const { mod, data, names } = await setup({ wipe: async () => { throw new Error('IDB KO') } })
    const r = await mod.eraseAllData()
    expect(r.ok).toBe(false)
    expect(r.steps.find((s) => s.id === 'indexeddb')?.ok).toBe(false)
    expect(data.size).toBe(0)
    expect(names.has('ign-tuiles')).toBe(false)
  })

  it('sans Supabase configuré, le module de synchro n’est pas chargé', async () => {
    const { mod, sync } = await setup({ configured: false })
    await mod.eraseAllData({ remote: 'snapshot' })
    expect(sync.deleteRemoteSnapshot).not.toHaveBeenCalled()
    expect(sync.signOutLocal).not.toHaveBeenCalled()
  })
})

describe('inventaire des données', () => {
  it('chaque entrée est complète, et les destinataires nomment les sous-traitants', () => {
    const inv = getDataInventory()
    expect(inv).toBe(DATA_INVENTORY)
    expect(new Set(inv.map((d) => d.id)).size).toBe(inv.length)
    for (const d of inv) {
      for (const k of ['donnee', 'stockage', 'finalite', 'duree', 'effacement'] as const) expect(d[k].length, `${d.id}.${k}`).toBeGreaterThan(5)
      expect(['execution', 'consentement', 'interet-legitime']).toContain(d.base)
    }
    const all = inv.flatMap((d) => d.destinataires).join(' ')
    for (const name of ['Vercel', 'IGN', 'Open-Meteo', 'Pl@ntNet', 'Supabase']) expect(all).toContain(name)
  })
  it('les permissions décrivent ce qui se passe en cas de refus', () => {
    expect(PERMISSIONS.map((p) => p.permission).join(' ')).toMatch(/Notifications/)
    for (const p of PERMISSIONS) expect(p.siRefusee.length).toBeGreaterThan(3)
  })
})

describe('catalogue : identifiants hostiles', () => {
  it('un identifiant d’espèce comme « constructor » ou « toString » ne désigne aucune fiche', async () => {
    const { SPECIES_BY_ID, getSpecies, SPECIES } = await import('../../data/species')
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'prototype']) {
      expect(SPECIES_BY_ID[id], id).toBeUndefined()
      expect(getSpecies(id), id).toBeUndefined()
    }
    expect(getSpecies(SPECIES[0].id)).toBe(SPECIES[0])
  })
})
