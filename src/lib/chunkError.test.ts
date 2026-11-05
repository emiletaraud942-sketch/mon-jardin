import { describe, expect, it, vi } from 'vitest'
import { installChunkErrorHandler } from './chunkError'

describe('installChunkErrorHandler', () => {
  it('propose le rechargement une seule fois, même si plusieurs morceaux échouent', () => {
    const target = new EventTarget()
    const onFail = vi.fn()
    installChunkErrorHandler(target, onFail)
    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    expect(onFail).toHaveBeenCalledTimes(1)
  })
  it('ne bloque pas l’erreur : l’écran concerné garde son propre message', () => {
    const target = new EventTarget()
    installChunkErrorHandler(target, () => undefined)
    const e = new Event('vite:preloadError', { cancelable: true })
    target.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
  it('se retire proprement', () => {
    const target = new EventTarget()
    const onFail = vi.fn()
    installChunkErrorHandler(target, onFail)()
    target.dispatchEvent(new Event('vite:preloadError'))
    expect(onFail).not.toHaveBeenCalled()
  })
})
