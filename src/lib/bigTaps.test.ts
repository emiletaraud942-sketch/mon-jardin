import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAP_BIG, TAP_NORMAL, parseBigTaps } from './bigTaps'

function stubBrowser(initial?: string) {
  const store = new Map<string, string>(initial ? [['pj.bigTaps', initial]] : [])
  const attrs = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal('window', { dispatchEvent: () => true })
  vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } })
  return { store, attrs }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('grandes touches', () => {
  it('44 px par défaut, 56 px avec le réglage', () => {
    expect(TAP_NORMAL).toBe(44)
    expect(TAP_BIG).toBe(56)
    expect(parseBigTaps('1')).toBe(true)
    expect(parseBigTaps(null)).toBe(false)
    expect(parseBigTaps('oui')).toBe(false)
  })

  it('mémorise le choix dans pj.bigTaps et pose l’attribut sur la page', async () => {
    const { store, attrs } = stubBrowser()
    const m = await import('./bigTaps')
    expect(m.getBigTaps()).toBe(false)
    m.setBigTaps(true)
    expect(store.get('pj.bigTaps')).toBe('1')
    expect(attrs.has('data-big-taps')).toBe(true)
    m.setBigTaps(false)
    expect(store.has('pj.bigTaps')).toBe(false)
    expect(attrs.has('data-big-taps')).toBe(false)
  })

  it('reprend le choix au lancement', async () => {
    const { attrs } = stubBrowser('1')
    const m = await import('./bigTaps')
    m.applyStoredBigTaps()
    expect(attrs.has('data-big-taps')).toBe(true)
  })

  it('mémoire indisponible : pas d’erreur', async () => {
    const attrs = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('QuotaExceededError')
      },
      removeItem() {
        throw new Error('SecurityError')
      },
    })
    vi.stubGlobal('window', { dispatchEvent: () => true })
    vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } })
    const m = await import('./bigTaps')
    expect(m.getBigTaps()).toBe(false)
    expect(() => m.setBigTaps(true)).not.toThrow()
    expect(attrs.has('data-big-taps')).toBe(true)
  })

  it('le CSS monte --tap à 56 px et la clé est dans l’inventaire', () => {
    const css = readFileSync(join(__dirname, '../styles/facile.css'), 'utf8')
    expect(css).toMatch(/html\[data-big-taps\] \{[^}]*--tap: 56px/)
    const inventory = readFileSync(join(__dirname, 'security/inventory.ts'), 'utf8')
    expect(inventory).toContain("'pj.bigTaps'")
    expect(inventory).toContain("'pj.tourSeen'")
  })
})
