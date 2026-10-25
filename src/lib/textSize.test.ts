import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEXT_SIZES, TEXT_SIZE_LABEL, TEXT_SIZE_PERCENT, parseTextSize } from './textSize'

function stubBrowser(initial?: string) {
  const store = new Map<string, string>(initial ? [['permajardin:text-size', initial]] : [])
  const attrs = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.stubGlobal('document', {
    documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) },
  })
  return { store, attrs }
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

describe('taille du texte', () => {
  it('trois tailles, avec des noms simples', () => {
    expect(TEXT_SIZES.map((t) => TEXT_SIZE_LABEL[t])).toEqual(['Normal', 'Grand', 'Très grand'])
    expect(TEXT_SIZE_PERCENT.normal).toBe(100)
    expect(TEXT_SIZE_PERCENT.grand).toBeGreaterThan(100)
    expect(TEXT_SIZE_PERCENT['tres-grand']).toBeGreaterThan(TEXT_SIZE_PERCENT.grand)
  })

  it('une valeur inconnue donne « normal »', () => {
    expect(parseTextSize('énorme')).toBe('normal')
    expect(parseTextSize(undefined)).toBe('normal')
    expect(parseTextSize('grand')).toBe('grand')
  })

  it('mémorise le choix et l’applique à la page', async () => {
    const { store, attrs } = stubBrowser()
    const m = await import('./textSize')
    m.setTextSize('tres-grand')
    expect(store.get('permajardin:text-size')).toBe('tres-grand')
    expect(attrs.get('data-text-size')).toBe('tres-grand')
    expect(m.getTextSize()).toBe('tres-grand')
  })

  it('« normal » efface le choix', async () => {
    const { store, attrs } = stubBrowser('grand')
    const m = await import('./textSize')
    m.applyStoredTextSize()
    expect(attrs.get('data-text-size')).toBe('grand')
    m.setTextSize('normal')
    expect(store.has('permajardin:text-size')).toBe(false)
    expect(attrs.has('data-text-size')).toBe(false)
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
    vi.stubGlobal('document', { documentElement: { setAttribute: (k: string, v: string) => attrs.set(k, v), removeAttribute: (k: string) => attrs.delete(k) } })
    const m = await import('./textSize')
    expect(m.getTextSize()).toBe('normal')
    expect(() => m.setTextSize('grand')).not.toThrow()
    expect(attrs.get('data-text-size')).toBe('grand')
  })
})
