import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasRoom, RESERVE_BYTES, roomFor, writeWithRetry } from './space'

const MB = 1024 * 1024

describe('hasRoom', () => {
  it('assez de place : oui, marge comprise', () => {
    expect(hasRoom({ quota: 100 * MB, usage: 10 * MB }, 1 * MB)).toBe(true)
    expect(hasRoom({ quota: 100 * MB, usage: 100 * MB - (1 * MB + RESERVE_BYTES) }, 1 * MB)).toBe(true)
  })
  it('pas assez : non, même si l’écriture seule tiendrait (la marge protège l’état du jardin)', () => {
    expect(hasRoom({ quota: 100 * MB, usage: 100 * MB - 2 * MB }, 1 * MB)).toBe(false)
    expect(hasRoom({ quota: 10 * MB, usage: 10 * MB }, 1)).toBe(false)
  })
  it('estimation absente ou incomplète : oui (on tente l’écriture)', () => {
    expect(hasRoom(undefined, 5 * MB)).toBe(true)
    expect(hasRoom({}, 5 * MB)).toBe(true)
    expect(hasRoom({ quota: 0, usage: 0 }, 5 * MB)).toBe(true)
    expect(hasRoom({ quota: 10 * MB }, 5 * MB)).toBe(true)
  })
})

describe('roomFor', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('lit l’estimation du navigateur', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 50 * MB, usage: 49 * MB }) } })
    expect(await roomFor(1 * MB)).toBe(false)
  })
  it('sans API ou si elle échoue : oui', async () => {
    vi.stubGlobal('navigator', {})
    expect(await roomFor(1 * MB)).toBe(true)
    vi.stubGlobal('navigator', { storage: { estimate: async () => { throw new Error('refusé') } } })
    expect(await roomFor(1 * MB)).toBe(true)
  })
})

describe('writeWithRetry', () => {
  const full = (e: unknown) => (e as { name?: string })?.name === 'QuotaExceededError'
  const quota = () => Object.assign(new Error('plein'), { name: 'QuotaExceededError' })
  it('réussit au deuxième essai quand la première écriture dit « plein »', async () => {
    const write = vi.fn().mockRejectedValueOnce(quota()).mockResolvedValueOnce('ok')
    expect(await writeWithRetry(write, full, { delayMs: 1 })).toBe('ok')
    expect(write).toHaveBeenCalledTimes(2)
  })
  it('relance l’erreur d’origine si c’est toujours plein', async () => {
    const write = vi.fn().mockRejectedValue(quota())
    await expect(writeWithRetry(write, full, { delayMs: 1 })).rejects.toThrow('plein')
    expect(write).toHaveBeenCalledTimes(2)
  })
  it('une autre erreur n’est jamais retentée', async () => {
    const write = vi.fn().mockRejectedValue(new Error('disque en panne'))
    await expect(writeWithRetry(write, full, { delayMs: 1 })).rejects.toThrow('disque en panne')
    expect(write).toHaveBeenCalledTimes(1)
  })
})
