import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Garden, Plant } from '../types'

// Faux stockage de photos et faux état : la sauvegarde complète est testée de bout en bout, sans navigateur.
const photoDb = new Map<string, Blob>()
vi.mock('./photos', () => ({
  getPhoto: async (id: string) => photoDb.get(id),
  restorePhoto: async (id: string, blob: Blob) => void photoDb.set(id, blob),
}))
const fixture: { gardens: Garden[]; plants: Plant[]; tasksDone: never[] } = { gardens: [], plants: [], tasksDone: [] }
vi.mock('./store', () => ({
  getState: () => fixture,
  panoramaPhotoIds: (gardens: Garden[]) => gardens.flatMap((g) => (g.panoramas ?? []).flatMap((p) => p.shots.map((s) => s.photoId))),
}))

const { buildFullBackup, isFullBackup, readFullBackup, restorePhotos, FULL_MAGIC } = await import('./backupFull')

/** Un faux JPEG 16 × 16 : assez d'en-tête pour être reconnu, puis du remplissage. */
const jpeg = (fill: number, extra = 40) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00, ...Array(extra).fill(fill)])], { type: 'image/jpeg' })
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

const garden: Garden = {
  id: 'g1', name: 'Jardin', address: 'Lyon', center: { lon: 4.83, lat: 45.76 }, createdAt: '2025-01-01T00:00:00.000Z',
  panoramas: [{ id: 'pan1', x: 1, y: 2, takenAt: '2026-05-01T10:00:00.000Z', kind: 'guide', northOk: true, shots: [{ photoId: 'photo:pano1', headingDeg: 10, fovDeg: 60 }] }],
}
const plant: Plant = { id: 'p1', gardenId: 'g1', speciesId: 'pommier', position: { x: 1, y: 2 }, plantedAt: '2024-03-10', status: 'en-place', photos: ['photo:aaa', 'photo:manquante'] }

beforeEach(() => {
  photoDb.clear()
  photoDb.set('photo:aaa', jpeg(1))
  photoDb.set('photo:pano1', jpeg(2))
  fixture.gardens = [garden]
  fixture.plants = [plant]
})

describe('sauvegarde complète : export', () => {
  it('commence par la signature, contient les photos présentes et compte les manquantes', async () => {
    const out = await buildFullBackup()
    expect(out.photos).toBe(2)
    expect(out.missing).toBe(1)
    expect(await isFullBackup(out.blob)).toBe(true)
    expect(await out.blob.slice(0, FULL_MAGIC.length).text()).toBe(FULL_MAGIC)
  })
  it('garde les points de vue en photos à part, dans l’en-tête', async () => {
    const out = await buildFullBackup()
    const text = await out.blob.text()
    expect(text).toContain('"panoramas"')
    expect(text).toContain('"pan1"')
  })
})

describe('sauvegarde complète : aller-retour', () => {
  it('restitue jardins, plantes, points de vue en photos et photos, octet pour octet', async () => {
    const out = await buildFullBackup()
    photoDb.clear() // un autre appareil
    const r = await readFullBackup(out.blob)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.gardens[0].panoramas?.[0].shots[0].photoId).toBe('photo:pano1')
    expect(r.data.plants[0].id).toBe('p1')
    expect(r.photos.map((p) => p.id).sort()).toEqual(['photo:aaa', 'photo:pano1'])
    expect(await restorePhotos(r.photos)).toBe(2)
    expect(await bytesOf(photoDb.get('photo:aaa')!)).toEqual(await bytesOf(jpeg(1)))
    expect(await bytesOf(photoDb.get('photo:pano1')!)).toEqual(await bytesOf(jpeg(2)))
    expect(photoDb.get('photo:aaa')!.type).toBe('image/jpeg')
  })
})

describe('sauvegarde complète : fichiers hostiles ou abîmés', () => {
  const read = (parts: BlobPart[]) => readFullBackup(new Blob(parts))
  const build = async () => (await buildFullBackup()).blob

  it('refuse un fichier qui n’a pas la signature', async () => {
    const r = await read(['{"gardens":[]}'])
    expect(r.ok).toBe(false)
  })
  it('refuse un fichier tronqué (photos manquantes en fin de fichier)', async () => {
    const b = await build()
    const r = await readFullBackup(b.slice(0, b.size - 10))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/incomplet|modifié/)
  })
  it('refuse un fichier auquel on a ajouté des octets', async () => {
    const b = await build()
    expect((await read([b, 'xx'])).ok).toBe(false)
  })
  it('refuse une longueur d’en-tête absurde', async () => {
    expect((await read([FULL_MAGIC, '9999999999\n', '{}'])).ok).toBe(false)
    expect((await read([FULL_MAGIC, 'abcdefghij\n', '{}'])).ok).toBe(false)
  })
  it('refuse une version plus récente', async () => {
    const head = JSON.stringify({ format: 'permajardin-complet', version: 9, state: { gardens: [] }, photos: [] })
    expect((await read([`${FULL_MAGIC}${String(head.length).padStart(10, '0')}\n`, head])).ok).toBe(false)
  })
  it('écarte une « photo » qui n’est pas une image, sans rien refuser d’autre', async () => {
    const head = JSON.stringify({
      format: 'permajardin-complet', version: 1,
      state: { version: 2, gardens: [garden], plants: [{ ...plant, photos: ['photo:aaa'] }], tasksDone: [] },
      photos: [{ id: 'photo:aaa', type: 'image/jpeg', size: 20 }],
    })
    const r = await read([`${FULL_MAGIC}${String(head.length).padStart(10, '0')}\n`, head, new Uint8Array(20).fill(65)])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.photos).toEqual([])
      expect(r.skipped).toBe(1)
    }
  })
  it('refuse un identifiant de photo qui vise une autre clé de la base', async () => {
    const head = JSON.stringify({ format: 'permajardin-complet', version: 1, state: { gardens: [garden] }, photos: [{ id: 'permajardin:state:v1', type: 'image/jpeg', size: 20 }] })
    expect((await read([`${FULL_MAGIC}${String(head.length).padStart(10, '0')}\n`, head, new Uint8Array(20)])).ok).toBe(false)
  })
  it('ignore les photos que les données ne référencent pas', async () => {
    const j = jpeg(3)
    const head = JSON.stringify({
      format: 'permajardin-complet', version: 1,
      state: { version: 2, gardens: [garden], plants: [{ ...plant, photos: [] }], tasksDone: [] },
      photos: [{ id: 'photo:inutile', type: 'image/jpeg', size: j.size }],
    })
    const r = await read([`${FULL_MAGIC}${String(head.length).padStart(10, '0')}\n`, head, j])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.photos).toEqual([])
  })
})
