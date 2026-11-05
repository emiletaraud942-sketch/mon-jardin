import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  del: async (k: string) => void db.delete(k),
  keys: async () => [...db.keys()],
}))

import { compressToTarget, deletePhoto, getPhoto, listPhotoIds, savePhoto, TARGET_BYTES } from './photos'

let close: ReturnType<typeof vi.fn>
let canvas: { width: number; height: number; getContext: () => unknown; toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => void }
let bytesFor: (w: number, h: number, q: number) => number | null

function stub(width = 4000, height = 3000) {
  close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width, height, close })))
  canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb, type, q) => {
      const n = bytesFor(canvas.width, canvas.height, q)
      cb(n === null ? null : new Blob([new Uint8Array(n)], { type }))
    },
  }
  vi.stubGlobal('document', { createElement: () => canvas })
}

beforeEach(() => {
  db.clear()
  bytesFor = (w, h, q) => Math.round(w * h * q * 0.3)
  stub()
})
afterEach(() => vi.unstubAllGlobals())

describe('compressToTarget', () => {
  it('réduit à 1280 px et vise moins de 700 ko, puis ferme le bitmap', async () => {
    const blob = await compressToTarget(new Blob(['x']))
    expect(blob.size).toBeLessThanOrEqual(TARGET_BYTES)
    expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(1280)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('garde la qualité maximale quand l’image est déjà légère', async () => {
    stub(800, 600)
    const qualities: number[] = []
    const original = canvas.toBlob
    canvas.toBlob = (cb, t, q) => {
      qualities.push(q)
      original(cb, t, q)
    }
    await compressToTarget(new Blob(['x']))
    expect(qualities).toEqual([0.82])
  })

  it('baisse qualité puis dimensions jusqu’à tenir dans la cible', async () => {
    bytesFor = (w, h, q) => Math.round(w * h * q * 1.2) // très lourd : impose de réduire
    const blob = await compressToTarget(new Blob(['x']), { targetBytes: 300 * 1024 })
    expect(blob.size).toBeLessThanOrEqual(300 * 1024)
    expect(Math.max(canvas.width, canvas.height)).toBeLessThan(1280)
  })

  it('renvoie le meilleur résultat si la cible est inatteignable (sans boucle infinie)', async () => {
    bytesFor = () => 5_000_000
    const blob = await compressToTarget(new Blob(['x']), { targetBytes: 1000 })
    expect(blob.size).toBe(5_000_000)
    expect(close).toHaveBeenCalled()
  })

  it('toBlob null : erreur claire et bitmap fermé', async () => {
    bytesFor = () => null
    await expect(compressToTarget(new Blob(['x']))).rejects.toThrow(/n'a pas pu être compressée/)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('format non décodable (HEIC) : message dédié', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => {
      throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
    }))
    await expect(compressToTarget(new Blob(['x']))).rejects.toThrow('Format de photo non pris en charge. Utilisez une photo JPEG ou PNG.')
  })
})

describe('stockage', () => {
  it('savePhoto enregistre un blob sous photo:* ; getPhoto/deletePhoto/listPhotoIds', async () => {
    db.set('autre', 1)
    const id = await savePhoto(new Blob(['x']))
    expect(id).toMatch(/^photo:/)
    expect(await getPhoto(id)).toBeInstanceOf(Blob)
    expect(await listPhotoIds()).toEqual([id])
    await deletePhoto(id)
    expect(await getPhoto(id)).toBeUndefined()
  })

  it('refuse avec le message dédié quand le téléphone est plein, sans rien écrire', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 10e6, usage: 9.9e6 }) } })
    await expect(savePhoto(new Blob(['x']))).rejects.toThrow('Il n’y a plus assez de place sur ce téléphone.')
    expect(await listPhotoIds()).toEqual([])
  })
})
