import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpStatusError, RETRY_AFTER_MAX_MS, createLimiter, fetchJson, fetchWithTimeout, friendlyError, parseRetryAfter } from './http'

describe('friendlyError', () => {
  it('garde tel quel le message « espace plein » de savePhoto, sans le cacher derrière « Informations techniques »', async () => {
    const { MESSAGE_FULL } = await import('./photos')
    expect(MESSAGE_FULL.length).toBeGreaterThan(160)
    expect(friendlyError(new Error(MESSAGE_FULL))).toEqual({ message: MESSAGE_FULL })
  })
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

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-11-08T10:00:00Z')
  it('secondes entières, date HTTP, borné à 5 s', () => {
    expect(parseRetryAfter('2', now)).toBe(2000)
    expect(parseRetryAfter('0', now)).toBe(0)
    expect(parseRetryAfter('120', now)).toBe(RETRY_AFTER_MAX_MS)
    expect(parseRetryAfter('Sun, 08 Nov 2026 10:00:03 GMT', now)).toBe(3000)
    expect(parseRetryAfter('Sun, 08 Nov 2026 09:00:00 GMT', now)).toBe(0) // date passée
  })
  it('absent ou illisible : undefined', () => {
    expect(parseRetryAfter(null, now)).toBeUndefined()
    expect(parseRetryAfter('', now)).toBeUndefined()
    expect(parseRetryAfter('bientôt', now)).toBeUndefined()
    expect(parseRetryAfter('-3', now)).toBeUndefined()
  })
  it('fetchJson garde le statut et Retry-After dans l’erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '3' } })))
    const e = (await fetchJson('/x', { service: 'IGN' }).catch((x: unknown) => x)) as HttpStatusError
    expect(e).toBeInstanceOf(HttpStatusError)
    expect(e.status).toBe(429)
    expect(e.retryAfterMs).toBe(3000)
    expect(e.message).toMatch(/IGN a répondu une erreur \(429\)/)
    vi.unstubAllGlobals()
  })
})

describe('createLimiter', () => {
  it('ne dépasse jamais le plafond de tâches simultanées', async () => {
    const lim = createLimiter(3)
    let running = 0
    let peak = 0
    const task = async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
    }
    await Promise.all(Array.from({ length: 12 }, () => lim.run(task)))
    expect(peak).toBe(3)
    expect(lim.active).toBe(0)
    expect(lim.queued).toBe(0)
  })
  it('espace les départs d’au moins minGapMs', async () => {
    const lim = createLimiter(5, 30)
    const starts: number[] = []
    await Promise.all(Array.from({ length: 4 }, () => lim.run(async () => void starts.push(Date.now()))))
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(25)
  })
  it('une tâche en erreur libère sa place ; un signal annulé la retire de la file', async () => {
    const lim = createLimiter(1)
    const first = lim.run(() => new Promise<void>((_r, rej) => setTimeout(() => rej(new Error('boum')), 10)))
    const ctrl = new AbortController()
    const queued = lim.run(async () => 'jamais', ctrl.signal).catch((e) => e as Error)
    const after = lim.run(async () => 'ok')
    ctrl.abort()
    await expect(first).rejects.toThrow('boum')
    expect(await queued).toMatchObject({ name: 'AbortError' })
    await expect(after).resolves.toBe('ok')
    await expect(lim.run(async () => 1, ctrl.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
