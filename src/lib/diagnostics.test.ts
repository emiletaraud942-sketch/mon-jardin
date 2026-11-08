import { afterEach, describe, expect, it, vi } from 'vitest'
import { versionLabel } from './appVersion'
import { buildDiagnostic, clearErrors, getErrors, installDiagnostics, recordError, RING_SIZE, scrub } from './diagnostics'

afterEach(clearErrors)

describe('scrub', () => {
  it('retire e-mails, paramètres d’adresse, coordonnées et identifiants', () => {
    const t = scrub('Échec pour marie@exemple.fr sur https://x.fr/ext/geopf/geocode?q=12+rue+des+Lilas&lat=48.85661 à 48.856614 photo:abcdef123456 123e4567-e89b-12d3-a456-426614174000')
    expect(t).not.toMatch(/marie|Lilas|48\.85|abcdef123456|123e4567/)
    expect(t).toContain('/ext/geopf/geocode')
  })
  it('coupe les textes longs', () => {
    expect(scrub('a'.repeat(1000)).length).toBe(240)
  })
})

describe('anneau d’erreurs', () => {
  it('garde les 20 dernières seulement', () => {
    for (let i = 0; i < 27; i++) recordError('erreur', new Error('n' + i))
    expect(getErrors()).toHaveLength(RING_SIZE)
    expect(getErrors()[0].message).toContain('n7')
    expect(getErrors()[RING_SIZE - 1].message).toContain('n26')
  })

  it('enregistre erreurs et promesses rejetées via les écouteurs globaux, puis se retire', () => {
    const t = new EventTarget()
    const off = installDiagnostics(t as unknown as Window)
    const err = new Event('error') as Event & { message: string; error: unknown }
    err.message = 'boum'
    err.error = new TypeError('boum')
    t.dispatchEvent(err)
    const rej = new Event('unhandledrejection') as Event & { reason: unknown }
    rej.reason = new Error('promesse perdue')
    t.dispatchEvent(rej)
    t.dispatchEvent(new Event('error')) // chargement d'image raté : ignoré
    expect(getErrors().map((x) => x.kind)).toEqual(['erreur', 'promesse'])
    off()
    t.dispatchEvent(rej)
    expect(getErrors()).toHaveLength(2)
  })
})

describe('buildDiagnostic', () => {
  it('ne contient que des comptes, jamais de noms ni de positions', () => {
    recordError('erreur', new Error('Échec pour jardin:abcdefgh1234'))
    const d = buildDiagnostic({
      now: new Date('2026-11-03T10:00:00Z'),
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      language: 'fr-FR',
      online: true,
      viewport: { w: 390, h: 844 },
      standalone: false,
      appVersion: '0.1.0',
      appCommit: 'abc1234',
      stateVersion: 2,
      counts: { jardins: 1, plantes: 12, tachesFaites: 30 },
      theme: 'light',
      textSize: 'normal',
    })
    const text = JSON.stringify(d)
    expect(d.donnees).toEqual({ versionAppli: '0.1.0', commitAppli: 'abc1234', versionFormat: 2, jardins: 1, plantes: 12, tachesFaites: 30 })
    expect(d.erreurs).toHaveLength(1)
    expect(text).not.toContain('abcdefgh1234')
  })
})

describe('version affichée', () => {
  it('le diagnostic contient la version et le commit', () => {
    const d = buildDiagnostic({
      now: new Date('2026-11-03T10:00:00Z'), userAgent: 'x', language: 'fr', online: true, viewport: { w: 1, h: 1 }, standalone: false,
      appVersion: '1.2.3', appCommit: 'deadbee', stateVersion: 2, counts: { jardins: 0, plantes: 0, tachesFaites: 0 }, theme: 'light', textSize: 'normal',
    })
    expect(JSON.stringify(d)).toContain('1.2.3')
    expect(JSON.stringify(d)).toContain('deadbee')
  })
  it('le texte du build est défini par vite (version de package.json, commit court ou « inconnu »)', () => {
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/)
    expect(__APP_COMMIT__).toMatch(/^([0-9a-f]{7,}|inconnu)$/)
    expect(versionLabel('0.1.0', 'abc1234')).toBe('Version 0.1.0 (commit abc1234)')
  })
})

describe('journal conservé en session', () => {
  function fakeSession(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial))
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    }
  }
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('écrit les erreurs dans sessionStorage (20 au plus) et les retrouve après un rechargement', async () => {
    const session = fakeSession()
    vi.stubGlobal('sessionStorage', session)
    vi.resetModules()
    const a = await import('./diagnostics')
    for (let i = 0; i < 25; i++) a.recordError('erreur', new Error('n' + i))
    const saved = JSON.parse(session.data.get('pj.errors') ?? '[]') as { message: string }[]
    expect(saved).toHaveLength(RING_SIZE)
    expect(saved[RING_SIZE - 1].message).toContain('n24')
    vi.resetModules()
    const b = await import('./diagnostics')
    expect(b.getErrors()).toHaveLength(RING_SIZE)
    expect(b.getErrors()[0].message).toContain('n5')
    b.clearErrors()
    expect(session.data.has('pj.errors')).toBe(false)
  })

  it('ignore un contenu abîmé ou des entrées invalides', async () => {
    vi.stubGlobal('sessionStorage', fakeSession({ 'pj.errors': '{pas du json' }))
    vi.resetModules()
    expect((await import('./diagnostics')).getErrors()).toHaveLength(0)
    vi.stubGlobal('sessionStorage', fakeSession({ 'pj.errors': JSON.stringify([{ at: 1 }, null, 'x', { at: '2026-11-08T10:00:00Z', kind: 'erreur', message: 'ok' }, { at: 'x', kind: 'inconnu', message: 'm' }]) }))
    vi.resetModules()
    const d = await import('./diagnostics')
    expect(d.getErrors().map((e) => e.message)).toEqual(['ok'])
  })

  it('ne casse rien si sessionStorage est bloqué', async () => {
    const boom = () => {
      throw new Error('bloqué')
    }
    vi.stubGlobal('sessionStorage', { getItem: boom, setItem: boom, removeItem: boom })
    vi.resetModules()
    const d = await import('./diagnostics')
    expect(() => d.recordError('erreur', new Error('x'))).not.toThrow()
    expect(d.getErrors()).toHaveLength(1)
    expect(() => d.clearErrors()).not.toThrow()
  })
})
