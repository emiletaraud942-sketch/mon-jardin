import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Map<string, unknown>()
let failSets = 0
let allowed = Infinity
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => {
    if (allowed-- <= 0 || failSets > 0) {
      if (failSets > 0) failSets--
      throw new DOMException('plein', 'QuotaExceededError')
    }
    db.set(k, v)
  },
  del: async (k: string) => void db.delete(k),
  keys: async () => [...db.keys()],
}))

import { buildFullBackup, FULL_KIND, FULL_MAX_PHOTO_BYTES, measurePhotos, parseFullBackup, photoRefs, planFull, restorePhotos, sizeText, type Measure } from './fullBackup'
import { migrateState, serializeState, STATE_VERSION, type StateData } from './migrate'
import type { Garden, Plant } from '../types'

/** Un JPEG minimal : SOI, SOF0 (2 x 2 px), EOI. */
const jpeg = (extra = 0) => new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x02, 0x01, 0x01, 0x11, 0x00, ...new Array(extra).fill(7), 0xff, 0xd9])
const blobOf = (extra = 0) => new Blob([jpeg(extra)], { type: 'image/jpeg' })

const garden = {
  id: 'g1', name: 'Jardin', address: '', center: { lon: 2, lat: 48 }, createdAt: '2026-01-01T00:00:00.000Z',
  panoramas: [{ id: 'pv1', x: 1, y: 2, takenAt: '2026-05-03T10:00:00.000Z', kind: 'guide', bytes: 40, shots: [{ photoId: 'photo:v1', headingDeg: 0, fovDeg: 60 }, { photoId: 'photo:v2', headingDeg: 90, fovDeg: 60 }] }],
} as unknown as Garden
const plant = { id: 'p1', gardenId: 'g1', speciesId: 'pommier', status: 'en-place', position: { x: 0, y: 0 }, photos: ['photo:a', 'photo:b'], plantedAt: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z' } as unknown as Plant
const data: StateData = { gardens: [garden], plants: [plant], tasksDone: [] }
const store: Record<string, Blob> = { 'photo:a': blobOf(10), 'photo:b': blobOf(20), 'photo:v1': blobOf(30), 'photo:v2': blobOf(40) }
const read = async (id: string) => store[id]

beforeEach(() => {
  db.clear()
  failSets = 0
  allowed = Infinity
})

describe('photoRefs', () => {
  it('sépare les photos des plantes et celles des points de vue, sans doublon', () => {
    const refs = photoRefs({ gardens: [garden], plants: [plant, { ...plant, id: 'p2', photos: ['photo:a'] }] })
    expect(refs.plants).toEqual(['photo:a', 'photo:b'])
    expect(refs.panoramas).toEqual(['photo:v1', 'photo:v2'])
  })
})

describe('buildFullBackup puis parseFullBackup', () => {
  it('aller-retour : données et images identiques, points de vue compris', async () => {
    const built = await buildFullBackup(data, { panoramas: true }, read)
    expect(built.photos).toBe(4)
    expect(built.missing).toBe(0)
    const r = parseFullBackup(await built.blob.text())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.plants[0].photos).toEqual(['photo:a', 'photo:b'])
    expect(r.data.gardens[0].panoramas).toHaveLength(1)
    expect(r.data.gardens[0].panoramas![0].bytes).toBe(40)
    expect([...r.photos.keys()].sort()).toEqual(['photo:a', 'photo:b', 'photo:v1', 'photo:v2'])
    expect((await r.photos.get('photo:b')!.arrayBuffer()).byteLength).toBe(jpeg(20).length)
    expect(r.skipped).toBe(0)
  })

  it('sans les panoramas : ils restent dehors, données et images', async () => {
    const built = await buildFullBackup(data, { panoramas: false }, read)
    expect(built.photos).toBe(2)
    const r = parseFullBackup(await built.blob.text())
    expect(r.ok && r.data.gardens[0].panoramas).toBeFalsy()
    expect(r.ok && [...r.photos.keys()]).toEqual(['photo:a', 'photo:b'])
  })

  it('une image absente de l’appareil est comptée, sans bloquer', async () => {
    const built = await buildFullBackup(data, { panoramas: false }, async (id) => (id === 'photo:a' ? undefined : store[id]))
    expect(built.photos).toBe(1)
    expect(built.missing).toBe(1)
    const text = await built.blob.text()
    expect(JSON.parse(text).photos).toHaveProperty('photo:b')
  })

  it('le fichier est un JSON valide, versionné, marqué « complet »', async () => {
    const j = JSON.parse(await (await buildFullBackup(data, { panoramas: true }, read)).blob.text())
    expect(j.version).toBe(STATE_VERSION)
    expect(j.kind).toBe(FULL_KIND)
    expect(Object.keys(j.photos)).toHaveLength(4)
  })

  it('un fichier sans photo (cas d’un jardin vide) reste valide', async () => {
    const built = await buildFullBackup({ gardens: [{ ...garden, panoramas: undefined }], plants: [], tasksDone: [] }, { panoramas: true }, read)
    const r = parseFullBackup(await built.blob.text())
    expect(r.ok && r.photos.size).toBe(0)
  })
})

describe('points de vue sans images dans le fichier', () => {
  it('ne reprend pas un point dont les images manquent, et le dit', async () => {
    const built = await buildFullBackup(data, { panoramas: true }, async (id) => (id.startsWith('photo:v') ? undefined : store[id]))
    const r = parseFullBackup(await built.blob.text())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.gardens[0].panoramas).toBeUndefined()
    expect(r.warnings.join(' ')).toMatch(/point de vue sans photos/)
  })
  it('garde les images présentes d’un point à moitié complet', async () => {
    const built = await buildFullBackup(data, { panoramas: true }, async (id) => (id === 'photo:v2' ? undefined : store[id]))
    const r = parseFullBackup(await built.blob.text())
    expect(r.ok && r.data.gardens[0].panoramas![0].shots.map((s) => s.photoId)).toEqual(['photo:v1'])
  })
})

describe('compatibilité avec l’ancien format', () => {
  it('un ancien fichier (sans photos) se reprend : données seules', () => {
    const old = JSON.stringify(serializeState(data))
    const r = parseFullBackup(old)
    expect(r.ok).toBe(true)
    expect(r.ok && r.photos.size).toBe(0)
    expect(r.ok && r.data.plants).toHaveLength(1)
  })

  it('un ancien lecteur (migrateState) lit un fichier complet et ignore les photos', async () => {
    const built = await buildFullBackup(data, { panoramas: true }, read)
    const m = migrateState(JSON.parse(await built.blob.text()))
    expect(m.ok).toBe(true)
    expect(m.ok && m.data.plants).toHaveLength(1)
  })

  it('refuse un fichier plus récent que l’application', () => {
    const r = parseFullBackup(JSON.stringify({ version: STATE_VERSION + 1, gardens: [], plants: [] }))
    expect(r.ok).toBe(false)
  })

  it('refuse un JSON illisible sans lever d’exception', () => {
    expect(parseFullBackup('{pas du json').ok).toBe(false)
  })
})

describe('images hostiles', () => {
  const file = (photos: unknown) => JSON.stringify({ ...serializeState(data), photos })
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')

  it('ignore une image que les données ne citent pas, un identifiant invalide et un type inconnu', () => {
    const r = parseFullBackup(file({ 'photo:zzz': { type: 'image/jpeg', data: b64(jpeg()) }, '../x': { type: 'image/jpeg', data: b64(jpeg()) }, 'photo:a': { type: 'text/html', data: b64(jpeg()) } }))
    expect(r.ok && r.photos.size).toBe(0)
    expect(r.ok && r.skipped).toBe(3)
  })

  it('refuse une image qui n’est pas ce qu’elle annonce, ou du base64 invalide', () => {
    const r = parseFullBackup(file({ 'photo:a': { type: 'image/png', data: b64(jpeg()) }, 'photo:b': { type: 'image/jpeg', data: '<script>' } }))
    expect(r.ok && r.photos.size).toBe(0)
    expect(r.ok && r.skipped).toBe(2)
  })

  it('refuse une image aux dimensions absurdes', () => {
    const huge = jpeg()
    huge[7] = 0xff; huge[8] = 0xff; huge[9] = 0xff; huge[10] = 0xff // 65535 x 65535
    const r = parseFullBackup(file({ 'photo:a': { type: 'image/jpeg', data: b64(huge) } }))
    expect(r.ok && r.photos.size).toBe(0)
  })

  it('un champ photos qui n’est pas un objet est ignoré', () => {
    const r = parseFullBackup(file(['photo:a']))
    expect(r.ok && r.photos.size).toBe(0)
  })
})

describe('taille', () => {
  const m = (plantsBytes: number, panoramasBytes: number): Measure => ({ plantsBytes, panoramasBytes, missing: 0, count: 10 })
  const MB = 1024 * 1024

  it('mesure les images citées et compte les absentes', async () => {
    const r = await measurePhotos(photoRefs(data), async (id) => (id === 'photo:v2' ? undefined : store[id]))
    expect(r.plantsBytes).toBe(jpeg(10).length + jpeg(20).length)
    expect(r.panoramasBytes).toBe(jpeg(30).length)
    expect(r.missing).toBe(1)
    expect(r.count).toBe(3)
  })

  it('tout tient : tout part, avec la taille du fichier (base64 = ×4/3)', () => {
    const p = planFull(m(10 * MB, 12 * MB))
    expect(p).toMatchObject({ ok: true, withPanoramas: true, bytes: 22 * MB })
    if (p.ok) expect(p.fileBytes).toBeGreaterThan((22 * MB * 4) / 3)
  })

  it('trop de panoramas : ils restent dehors, les photos des plantes partent', () => {
    expect(planFull(m(10 * MB, 70 * MB))).toMatchObject({ ok: true, withPanoramas: false, bytes: 10 * MB })
  })

  it('l’utilisateur peut aussi laisser les panoramas dehors', () => {
    expect(planFull(m(10 * MB, 5 * MB), false)).toMatchObject({ ok: true, withPanoramas: false })
  })

  it('les photos des plantes seules dépassent le plafond : refus', () => {
    expect(planFull(m(FULL_MAX_PHOTO_BYTES + 1, 0))).toMatchObject({ ok: false, reason: 'trop-gros' })
  })

  it('sizeText', () => {
    expect(sizeText(300 * 1024)).toBe('300 Ko')
    expect(sizeText(2.5 * MB)).toBe('2,5 Mo')
  })
})

describe('restorePhotos', () => {
  const photos = () => new Map([['photo:a', blobOf(1)], ['photo:b', blobOf(2)]])

  it('range les images dans l’appareil', async () => {
    expect(await restorePhotos(photos())).toBe(2)
    expect([...db.keys()].sort()).toEqual(['photo:a', 'photo:b'])
  })

  it('une écriture refusée est retentée une fois', async () => {
    failSets = 1
    expect(await restorePhotos(photos())).toBe(2)
  })

  it('plus de place : retire ce qui a été écrit et le dit avec le message dédié', async () => {
    allowed = 1 // la 1re image passe, la 2e et sa nouvelle tentative sont refusées
    await expect(restorePhotos(photos())).rejects.toThrow('Il n’y a plus assez de place sur ce téléphone.')
    expect([...db.keys()]).toEqual([])
  })

  it('rien à ranger : rien à faire', async () => {
    expect(await restorePhotos(new Map())).toBe(0)
  })
})
