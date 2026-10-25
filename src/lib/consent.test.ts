import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_KEY, CONSENT_VERSION, consentDate, grantConsent, hasConsent, resetConsentMemory, revokeConsent } from './consent'

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init))
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}
const broken = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

beforeEach(() => resetConsentMemory())
afterEach(() => vi.unstubAllGlobals())

describe('consentements', () => {
  it('« voisins » est un accord à part, sans effet sur les autres', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(hasConsent('voisins')).toBe(false)
    grantConsent('voisins')
    expect(hasConsent('voisins')).toBe(true)
    expect(hasConsent('plantnet')).toBe(false)
    revokeConsent('voisins')
    expect(hasConsent('voisins')).toBe(false)
  })

  it('« notifications » est un accord à part : il ne dépend pas de « voisins » et ne l’accorde pas', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(hasConsent('notifications')).toBe(false)
    grantConsent('voisins')
    expect(hasConsent('notifications')).toBe(false)
    grantConsent('notifications')
    expect(hasConsent('notifications')).toBe(true)
    revokeConsent('voisins')
    expect(hasConsent('notifications')).toBe(true)
    revokeConsent('notifications')
    expect(hasConsent('notifications')).toBe(false)
  })

  it('première demande : rien n’est accordé', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(hasConsent('plantnet')).toBe(false)
    expect(hasConsent('sync')).toBe(false)
  })

  it('un accord est mémorisé, par finalité, avec sa date', () => {
    const s = memoryStorage()
    vi.stubGlobal('localStorage', s)
    grantConsent('plantnet', new Date('2026-05-01T10:00:00Z'))
    expect(hasConsent('plantnet')).toBe(true)
    expect(hasConsent('sync')).toBe(false)
    expect(consentDate('plantnet')).toBe('2026-05-01T10:00:00.000Z')
    expect(JSON.parse(s.data.get(CONSENT_KEY)!).v).toBe(CONSENT_VERSION)
  })

  it('le retrait fait redemander, sans toucher à l’autre accord', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    grantConsent('plantnet')
    grantConsent('sync')
    revokeConsent('plantnet')
    expect(hasConsent('plantnet')).toBe(false)
    expect(hasConsent('sync')).toBe(true)
  })

  it('un accord d’une autre version ne compte pas', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [CONSENT_KEY]: JSON.stringify({ v: CONSENT_VERSION + 1, plantnet: '2026-01-01' }) }))
    expect(hasConsent('plantnet')).toBe(false)
  })

  it('un contenu illisible vaut refus', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [CONSENT_KEY]: '{pas du json' }))
    expect(hasConsent('plantnet')).toBe(false)
  })

  it('localStorage indisponible : pas d’erreur, accord valable pour la session seulement', () => {
    vi.stubGlobal('localStorage', broken)
    expect(hasConsent('plantnet')).toBe(false)
    expect(() => grantConsent('plantnet')).not.toThrow()
    expect(hasConsent('plantnet')).toBe(true)
    revokeConsent('plantnet')
    expect(hasConsent('plantnet')).toBe(false)
    resetConsentMemory()
    expect(hasConsent('plantnet')).toBe(false)
  })
})
