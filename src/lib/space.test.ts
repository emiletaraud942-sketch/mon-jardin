import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureRoom, hasRoom, isQuotaError, RESERVE_BYTES, STORAGE_FULL_MESSAGE, StorageFullError, writeWithRetry } from './space'

afterEach(() => vi.unstubAllGlobals())

describe('hasRoom', () => {
  it('accepte quand la place restante couvre l’écriture et la marge', () => {
    expect(hasRoom({ quota: 100e6, usage: 10e6 }, 1e6)).toBe(true)
    expect(hasRoom({ quota: 100e6, usage: 100e6 - 1e6 }, 1e6)).toBe(false)
    expect(hasRoom({ quota: 100e6, usage: 100e6 - 1e6 - RESERVE_BYTES }, 1e6)).toBe(true)
  })
  it('accepte quand l’estimation manque', () => {
    expect(hasRoom(undefined, 1e9)).toBe(true)
    expect(hasRoom({}, 1e9)).toBe(true)
    expect(hasRoom({ quota: 0, usage: 0 }, 1e9)).toBe(true)
  })
})

describe('isQuotaError', () => {
  it('reconnaît les formes connues', () => {
    expect(isQuotaError(new DOMException('x', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError({ code: 22 })).toBe(true)
    expect(isQuotaError(new StorageFullError())).toBe(true)
    expect(isQuotaError(new Error('autre'))).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })
})

describe('ensureRoom', () => {
  it('refuse avec le message dédié quand il n’y a plus de place', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 50e6, usage: 49.5e6 }) } })
    await expect(ensureRoom(1e6)).rejects.toThrow(STORAGE_FULL_MESSAGE)
  })
  it('laisse passer quand l’estimation échoue', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => { throw new Error('non') } } })
    await expect(ensureRoom(1e6)).resolves.toBeUndefined()
  })
})

describe('writeWithRetry', () => {
  it('recommence une fois après une erreur de place, puis réussit', async () => {
    let n = 0
    const r = await writeWithRetry(async () => {
      if (++n === 1) throw new DOMException('plein', 'QuotaExceededError')
      return 'ok'
    }, { delayMs: 1 })
    expect(r).toBe('ok')
    expect(n).toBe(2)
  })
  it('lève le message dédié si la seconde tentative échoue aussi', async () => {
    const write = vi.fn(async () => { throw new DOMException('plein', 'QuotaExceededError') })
    await expect(writeWithRetry(write, { delayMs: 1 })).rejects.toThrow(STORAGE_FULL_MESSAGE)
    expect(write).toHaveBeenCalledTimes(2)
  })
  it('ne recommence pas une autre erreur', async () => {
    const write = vi.fn(async () => { throw new Error('autre') })
    await expect(writeWithRetry(write, { delayMs: 1 })).rejects.toThrow('autre')
    expect(write).toHaveBeenCalledTimes(1)
  })
})
