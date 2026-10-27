import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = new Map<string, unknown>()
let failSet: Error | undefined
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => {
    if (failSet) throw failSet
    db.set(k, v)
  },
  del: async (k: string) => void db.delete(k),
  keys: async () => [...db.keys()],
}))

import { compressToTarget, deletePhoto, getPhoto, isQuotaError, listPhotoIds, MESSAGE_FULL, restorePhoto, savePhoto, TARGET_BYTES } from './photos'

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
  failSet = undefined
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
})

describe('stockage plein', () => {
  const quota = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
  it('isQuotaError reconnaît les variantes des navigateurs', () => {
    expect(isQuotaError(quota())).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError({ code: 22 })).toBe(true)
    expect(isQuotaError(new Error('autre'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
  it('savePhoto dit en français que l’espace est plein, et ne laisse rien derrière', async () => {
    failSet = quota()
    await expect(savePhoto(new Blob(['x']))).rejects.toThrow(MESSAGE_FULL)
    expect(await listPhotoIds()).toEqual([])
  })
  it('une autre panne d’écriture est relancée telle quelle', async () => {
    failSet = new Error('disque en panne')
    await expect(savePhoto(new Blob(['x']))).rejects.toThrow('disque en panne')
  })
  it('restorePhoto : même message, et un identifiant invalide est sans effet', async () => {
    failSet = quota()
    await expect(restorePhoto('photo:abc', new Blob(['x']))).rejects.toThrow(MESSAGE_FULL)
    await restorePhoto('permajardin:state:v1', new Blob(['x'])) // ne lève pas, n'écrit rien
    failSet = undefined
    await restorePhoto('permajardin:state:v1', new Blob(['x']))
    expect(db.size).toBe(0)
  })
})
