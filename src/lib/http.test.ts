import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, friendlyError } from './http'

describe('friendlyError', () => {
  it('garde les phrases déjà simples', () => {
    expect(friendlyError(new Error('Connexion impossible. Vérifiez votre accès à Internet.')).message).toBe('Connexion impossible. Vérifiez votre accès à Internet.')
    expect(friendlyError(new Error('Le service met trop de temps à répondre. Réessayez dans un instant.'))).toEqual({
      message: 'Le service met trop de temps à répondre. Réessayez dans un instant.',
    })
    expect(friendlyError(new Error('Photo illisible. Essayez une autre photo.')).detail).toBeUndefined()
  })

  it('cache le code d’erreur dans « Détails »', () => {
    const r = friendlyError(new Error('IGN a répondu une erreur (503).'))
    expect(r.message).toBe('Le service ne répond pas pour le moment. Réessayez plus tard.')
    expect(r.detail).toBe('IGN a répondu une erreur (503).')
    expect(friendlyError(new Error('Open-Meteo a renvoyé une réponse illisible.')).detail).toContain('Open-Meteo')
  })

  it('remplace un message technique par une phrase simple', () => {
    const r = friendlyError(new TypeError("Cannot read properties of undefined (reading 'x')"))
    expect(r.message).toBe('Un problème est survenu. Réessayez dans un instant.')
    expect(r.detail).toContain('undefined')
    expect(friendlyError('{"error":"x"}').detail).toBe('{"error":"x"}')
  })

  it('erreur vide ou inconnue : phrase générique, pas de détail', () => {
    expect(friendlyError(undefined)).toEqual({ message: 'Un problème est survenu. Réessayez dans un instant.' })
    expect(friendlyError(new Error(''))).toEqual({ message: 'Un problème est survenu. Réessayez dans un instant.' })
  })
})

describe('fetchWithTimeout : signal d’annulation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('signal déjà abandonné : aucune requête n’est envoyée, erreur AbortError', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(fetchWithTimeout('/x', { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('abandon en cours de route : la requête est annulée et l’erreur reste AbortError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: unknown, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))),
    )
    const ctrl = new AbortController()
    const p = fetchWithTimeout('/x', { signal: ctrl.signal })
    ctrl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('l’écouteur du signal est retiré à la fin (succès comme échec)', async () => {
    const ctrl = new AbortController()
    const add = vi.spyOn(ctrl.signal, 'addEventListener')
    const remove = vi.spyOn(ctrl.signal, 'removeEventListener')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('ok')).mockRejectedValueOnce(new TypeError('Failed to fetch')))
    await fetchWithTimeout('/x', { signal: ctrl.signal })
    await expect(fetchWithTimeout('/x', { signal: ctrl.signal })).rejects.toThrow('Connexion impossible')
    expect(add).toHaveBeenCalledTimes(2)
    expect(remove).toHaveBeenCalledTimes(2)
    expect(remove.mock.calls[0][1]).toBe(add.mock.calls[0][1])
  })

  it('délai dépassé sans signal externe : message de délai', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn((_u: unknown, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))),
      )
      const p = fetchWithTimeout('/x', { timeoutMs: 50 })
      const check = expect(p).rejects.toThrow('trop de temps')
      await vi.advanceTimersByTimeAsync(60)
      await check
    } finally {
      vi.useRealTimers()
    }
  })
})
